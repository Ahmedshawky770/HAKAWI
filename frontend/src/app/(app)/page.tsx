"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Story } from "@/types/api";

export default function DashboardPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.listStories({ page: 1, limit: 20 });
        setStories(data.stories);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stories");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <Link href="/stories/create">
          <Button>Create Story</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-gray-600">Total Stories</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stories.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-gray-600">Total Views</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {stories.reduce((sum, s) => sum + s.views, 0).toLocaleString()}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-gray-600">Total Reactions</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {stories.reduce((sum, s) => sum + s.reactions, 0).toLocaleString()}
            </p>
          </CardBody>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Stories</h2>
        <div className="space-y-4">
          {stories.map((story) => (
            <Card key={story.id}>
              <CardBody>
                <Link href={`/stories/${story.id}`} className="block">
                  <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                    {story.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">By {story.author.name}</p>
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    <span>{story.views.toLocaleString()} views</span>
                    <span>{story.reactions} reactions</span>
                    <span className="capitalize">{story.category}</span>
                  </div>
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
