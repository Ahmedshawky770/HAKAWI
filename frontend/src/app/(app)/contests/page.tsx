"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Contest } from "@/types/api";

export default function ContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.listContests();
        setContests(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contests");
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
        <h1 className="text-3xl font-bold text-gray-900">Contests</h1>
      </div>
      <div className="space-y-4">
        {contests.map((contest) => (
          <Card key={contest.id}>
            <CardBody>
              <Link href={`/contests/${contest.id}`} className="block">
                <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                  {contest.title}
                </h3>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{contest.description}</p>
                <div className="flex gap-4 mt-3 text-sm text-gray-500">
                  <span className="capitalize">{contest.category}</span>
                  <span className="capitalize">{contest.status}</span>
                  <span>Prize: {contest.prizeValue}</span>
                </div>
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
