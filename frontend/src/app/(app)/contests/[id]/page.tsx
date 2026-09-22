"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Contest } from "@/types/api";

export default function ContestDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storyId, setStoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getContest(id);
        setContest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contest");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.submitEntry(id, storyId);
      alert("Entry submitted successfully!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!contest) return <div className="p-6">Contest not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/contests" className="text-blue-600 hover:text-blue-500">
          ← Back to contests
        </Link>
      </div>
      <Card>
        <CardBody>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{contest.title}</h1>
          <p className="text-gray-700 mb-4">{contest.description}</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Category</p>
              <p className="font-medium capitalize">{contest.category}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="font-medium capitalize">{contest.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Start Date</p>
              <p className="font-medium">{new Date(contest.startDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">End Date</p>
              <p className="font-medium">{new Date(contest.endDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Submission Deadline</p>
              <p className="font-medium">{new Date(contest.submissionDeadline).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Prize</p>
              <p className="font-medium">
                {contest.prizeType === "cash" ? `$${contest.prizeValue}` : contest.prizeValue}
              </p>
            </div>
          </div>
          {contest.rules && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Rules</h3>
              <p className="text-gray-700">{contest.rules}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Submit Entry</h3>
            <div className="space-y-4">
              <Input
                label="Story ID"
                type="text"
                required
                value={storyId}
                onChange={(e) => setStoryId(e.target.value)}
                placeholder="Enter story ID"
              />
              <Button type="submit" loading={submitting}>
                Submit Entry
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
