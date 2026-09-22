"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function CreateStoryPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fiction");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.createStory({
        title,
        content,
        category,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push(`/stories/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create story");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Story</h1>
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
              placeholder="Enter story title"
            />
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your story here..."
                required
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
              placeholder="adventure, mystery"
            />
            <div className="flex gap-3">
              <Button type="submit" loading={loading}>
                Create Story
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
