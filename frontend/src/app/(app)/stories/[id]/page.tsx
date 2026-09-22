"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Story } from "@/types/api";

export default function StoryDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getStory(id);
        setStory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load story");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!story) return <div className="p-6">Story not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/stories" className="text-blue-600 hover:text-blue-500">
          ← Back to stories
        </Link>
      </div>
      <Card>
        <CardBody>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{story.title}</h1>
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/users/${story.author.id}`} className="text-blue-600 hover:text-blue-500">
              By {story.author.name}
            </Link>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500 text-sm">
              {new Date(story.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="prose max-w-none mb-6">
            {story.content ? (
              <div dangerouslySetInnerHTML={{ __html: story.content }} />
            ) : (
              <p className="text-gray-500 italic">No content available</p>
            )}
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>{story.views.toLocaleString()} views</span>
            <span>{story.reactions} reactions</span>
            <span className="capitalize">{story.category}</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
