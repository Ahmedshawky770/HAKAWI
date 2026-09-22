"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Story } from "@/types/api";

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.listStories({ page: 1, limit: 20, category: category || undefined });
        setStories(data.stories);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stories");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [category]);

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Stories</h1>
        <Link href="/stories/create">
          <Button>Create Story</Button>
        </Link>
      </div>
      <div className="mb-6">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All categories</option>
          <option value="fiction">Fiction</option>
          <option value="non-fiction">Non-Fiction</option>
          <option value="poetry">Poetry</option>
          <option value="fantasy">Fantasy</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stories.map((story) => (
          <Card key={story.id}>
            <CardBody>
              <Link href={`/stories/${story.id}`} className="block">
                <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                  {story.title}
                </h3>
                <p className="text-sm text-gray-600 mt-1">By {story.author.name}</p>
                <div className="flex gap-4 mt-3 text-sm text-gray-500">
                  <span>{story.views.toLocaleString()} views</span>
                  <span>{story.reactions} reactions</span>
                </div>
                <span className="inline-block mt-3 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded capitalize">
                  {story.category}
                </span>
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
