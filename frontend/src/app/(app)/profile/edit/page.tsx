"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function EditProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const tokens = localStorage.getItem("hakawi_tokens");
      if (!tokens) {
        router.push("/login");
        return;
      }
      try {
        const parsed = JSON.parse(tokens);
        const userId = parsed.userId || parsed.user?.id;
        if (!userId) {
          router.push("/login");
          return;
        }
        const data = await api.getUser(userId);
        setName(data.name);
        setBio(data.bio || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const tokens = localStorage.getItem("hakawi_tokens");
      if (!tokens) {
        router.push("/login");
        return;
      }
      const parsed = JSON.parse(tokens);
      const userId = parsed.userId || parsed.user?.id;
      if (!userId) {
        router.push("/login");
        return;
      }
      await api.updateUser(userId, { name, bio });
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Profile</h1>
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <ErrorMessage error={error} />}
            <Input
              label="Full name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
