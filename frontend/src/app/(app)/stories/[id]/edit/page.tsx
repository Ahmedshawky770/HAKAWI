"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Story } from "@/types/api";

export default function EditStoryPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [story, setStory] = useState<Story | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fiction");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getStory(id);
        setStory(data);
        setTitle(data.title);
        setContent(data.content || "");
        setCategory(data.category);
        setTags((data.tags || []).join(", "));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load story");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.updateStory(id, {
        title,
        content,
        category,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push(`/stories/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update story");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!story) return <div className="p-6">Story not found</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Story</h1>
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <ErrorMessage error={error} />}
            <Input
              label="Title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fiction">Fiction</option>
                <option value="non-fiction">Non-Fiction</option>
                <option value="poetry">Poetry</option>
                <option value="fantasy">Fantasy</option>
              </select>
            </div>
            <Input
              label="Tags (comma-separated)"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
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
