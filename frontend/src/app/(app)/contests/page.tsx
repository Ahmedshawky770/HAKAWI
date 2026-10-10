"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ContestCard, ContestListEmpty, ContestListSkeleton } from "@/components/social/ContestCard";
import type { Contest } from "@/types/api";

export default function ContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.listContests();
      setContests(data.contests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المسابقات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError("");
    void load();
  };

  if (loading) {
    return (
      <>
        <PageHeader title="المسابقات" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
        </p>
        <ContestListSkeleton />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} title="تعذّر تحميل المسابقات" />;
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="المسابقات"
        description="اكتب قصتك، وشاركها في مسابقة، واقرأ أعمال الآخرين."
      />

      {contests.length === 0 ? (
        <ContestListEmpty />
      ) : (
        <ul className="space-y-4">
          {contests.map((contest) => (
            <li key={contest.id}>
              <ContestCard contest={contest} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}