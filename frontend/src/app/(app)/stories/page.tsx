"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Select } from "@/components/ui/Input";
import { StoryCardCompact } from "@/components/story/StoryCard";
import { STORY_CATEGORY_FILTER_OPTIONS } from "@/components/story/StoryCategoryOptions";
import { StoryFeedSkeleton } from "@/components/story/StoryCard";
import type { Story } from "@/types/api";

const STORY_LIST_LIMIT = 20;

/**
 * The story index: the whole catalogue, filterable by category.
 *
 * ONE COLUMN, NOT THREE. The feed column this page renders inside is 672px wide
 * (§5 of the design system). A three-column grid inside it gives each card about
 * 200px, which is too narrow for the Arabic title to take more than one line and
 * leaves the excerpt three words long — the card becomes a thumbnail with a
 * caption. `StoryCardCompact` is the variant built for exactly this: no cover,
 * a three-line excerpt, the byline and the view count.
 *
 * The filter is a labelled `Select` (not a bare `<select>`), so it is announced,
 * focusable with the product's ring and sized like every other control in the
 * product. Selecting a category refetches with that filter and nothing else
 * changes: the request, the limit and the response handling are the ones this page
 * always made.
 */
export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(() => {
    api
      .listStories({
        page: 1,
        limit: STORY_LIST_LIMIT,
        category: category || undefined,
      })
      .then(
        (data) => setStories(data.stories),
        (failure) => setError(failure instanceof Error ? failure.message : "فشل تحميل القصص"),
      )
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Retry owns the "start again" state, so the mounting effect stays async-only. */
  function retry() {
    setLoading(true);
    setError("");
    void load();
  }

  return (
    <div>
      <PageHeader
        title="القصص"
        description="كل الحكايات المنشورة، وأحدثها أولاً."
        action={
          <ButtonLink href="/stories/create" variant="primary">
            اكتب قصة
          </ButtonLink>
        }
      />

      <div className="mb-6 max-w-xs">
        <Select
          label="التصنيف"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={STORY_CATEGORY_FILTER_OPTIONS}
        />
      </div>

      {error ? (
        <ErrorMessage
          error={error}
          title="تعذّر تحميل القصص"
          onRetry={retry}
          retryLabel="أعد المحاولة"
        />
      ) : loading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            جارٍ التحميل…
          </span>
          <StoryFeedSkeleton count={4} variant="compact" />
        </div>
      ) : stories.length === 0 ? (
        <EmptyState
          icon="book"
          title="لا توجد قصص بعد"
          description={
            category
              ? "لا توجد قصص في هذا التصنيف. جرّب تصنيفاً آخر أو اكتب أول قصة."
              : "لم يُنشر شيء بعد. كن أول من يروي حكاية."
          }
          action={
            <ButtonLink href="/stories/create" variant="primary">
              اكتب قصة
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-4">
          {stories.map((story) => (
            <li key={story.id}>
              <StoryCardCompact story={story} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}