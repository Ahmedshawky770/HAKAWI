"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { User } from "@/types/api";

export default function ProfilePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getUser(id);
        setUser(data as unknown as User);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <div className="p-6">User not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardBody>
          <div className="flex items-start gap-6">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              <p className="text-gray-600">@{user.username}</p>
              <p className="text-gray-500 mt-2">{user.bio || "No bio yet"}</p>
              <div className="flex gap-6 mt-4">
                <div>
                  <span className="font-semibold">{user.stats?.storiesCount ?? 0}</span>
                  <span className="text-gray-600 ml-1">Stories</span>
                </div>
                <div>
                  <span className="font-semibold">{user.stats?.followersCount ?? 0}</span>
                  <span className="text-gray-600 ml-1">Followers</span>
                </div>
                <div>
                  <span className="font-semibold">{user.stats?.followingCount ?? 0}</span>
                  <span className="text-gray-600 ml-1">Following</span>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
