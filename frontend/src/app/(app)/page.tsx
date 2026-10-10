"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { ButtonLink } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { StoryCard, StoryFeedSkeleton } from "@/components/story/StoryCard";
import type { Story } from "@/types/api";

const DASHBOARD_STORY_LIMIT = 20;

/**
 * The dashboard.
 *
 * Three totals, then the twenty most recent stories. Both halves come from the
 * same single `GET /stories?page=1&limit=20` response, which is why the totals are
 * the sum of the list rather than a second aggregate endpoint: one request, one
 * truth, and a dashboard that cannot show 20 cards above a count of 19.
 *
 * The four states of the list are all implemented — a shaped skeleton while the
 * request is in flight, the semantic error surface with a retry when it fails, an
 * empty state that offers the action that fills it, and the cards themselves.
 * The header and the totals row are rendered in every one of those states except a
 * failure, so the page does not jump under the reader when the data lands.
 */
export default function DashboardPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .listStories({ page: 1, limit: DASHBOARD_STORY_LIMIT })
      .then(
        (data) => setStories(data.stories),
        (failure) => setError(failure instanceof Error ? failure.message : "فشل تحميل القصص"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** The retry control's own handler: it owns the "start again" state, so the
   *  effect that mounts the page never sets state synchronously. */
  function retry() {
    setLoading(true);
    setError("");
    void load();
  }

  const views = stories.reduce((sum, story) => sum + story.views, 0);
  const reactions = stories.reduce((sum, story) => sum + story.reactions, 0);

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        description="نظرة سريعة على ما منشور وما تفاعل معه القرّاء."
        action={
          <ButtonLink href="/stories/create" variant="primary">
            اكتب قصة
          </ButtonLink>
        }
      />

      {error ? (
        <ErrorMessage
          error={error}
          title="تعذّر تحميل لوحة التحكم"
          onRetry={retry}
          retryLabel="أعد المحاولة"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {loading ? (
              <>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </>
            ) : (
              <>
                <StatCard label="إجمالي القصص" value={stories.length.toLocaleString()} icon="book" />
                <StatCard label="إجمالي المشاهدات" value={views.toLocaleString()} icon="eye" />
                <StatCard label="إجمالي التفاعلات" value={reactions.toLocaleString()} icon="heart" />
              </>
            )}
          </div>

          <section className="mt-8" aria-labelledby="latest-stories-heading">
            <h2 id="latest-stories-heading" className="mb-4 text-xl font-semibold text-ink">
              أحدث القصص
            </h2>

            {loading ? (
              <div aria-busy="true">
                <span role="status" className="sr-only">
                  جارٍ التحميل…
                </span>
                <StoryFeedSkeleton count={3} />
              </div>
            ) : stories.length === 0 ? (
              <EmptyState
                icon="book"
                title="لا توجد قصص بعد"
                description="لوحة التحكم تجمع ما تنشره هنا. اكتب أول قصة لتبدأ العدادات."
                action={
                  <ButtonLink href="/stories/create" variant="primary">
                    اكتب قصة
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="space-y-6">
                {stories.map((story) => (
                  <li key={story.id}>
                    <StoryCard story={story} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * The placeholder for a `StatCard`, at the same height (padding, label, value) so
 * the totals row does not resize when the numbers arrive.
 */
function StatSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-2 h-8 w-16" />
    </Card>
  );
}