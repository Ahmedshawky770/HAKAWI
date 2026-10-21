"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { StoryPatchInput } from "@hakawi/shared-types";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useInvalidation, useStory } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { storyCategories } from "@/components/story/StoryCategoryOptions";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Story } from "@/types/api";

const TITLE_LIMIT = 120;

/**
 * The edit-story form: the create form, pre-filled.
 *
 * TWO ERROR STATES, NOT ONE. The page used to keep a single `error` string for
 * both "the story would not load" and "the save was rejected", and then returned
 * the whole page for that error — so a rejected save unmounted the form and threw
 * away everything the writer had typed. A failure of the LOAD replaces the page
 * (there is nothing to edit); a failure of the SAVE is announced at the top of the
 * form, which is still full of the reader's work.
 *
 * The story comes from the shared cache (`useStory`), so the page and the story
 * itself read the same entry: opening the editor does not fetch a second copy of
 * a story the reader may already have on screen.
 *
 * The category list gains the story's own category when it is not one of the four
 * known values. A `<select>` can only show its own options, so a story filed under
 * any other category used to display the first option while submitting the real
 * one — the control disagreed with the payload, and the writer could not tell which
 * of the two the server would store.
 *
 * Submission is unchanged: the same `api.updateStory` payload, the same redirect to
 * the story — and the story's own cache entry is invalidated on the way out, so
 * the page the reader lands on shows what the server stored.
 */
export default function EditStoryPage() {
  const params = useParams();
  const { strings } = useLocale();
  const id = typeof params.id === "string" ? params.id : "";
  const query = useStory(id);

  return (
    <div>
      <PageHeader
        title={strings.story.editPageTitle}
        description={strings.story.editPageDescription}
      />

      {query.isLoading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            {strings.common.loading}
          </span>
          <Card className="p-6">
            {/* Mirrors the form's own field order and heights — title, body, then
                the two short fields — so the card does not resize on arrival. */}
            <div className="space-y-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full" rounded="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-32 w-full" rounded="rounded-lg" />
              </div>
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full" rounded="rounded-lg" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : isFailedLoad(query) ? (
        <ErrorMessage
          error={strings.errors[classifyError(query.error)]}
          title={strings.story.storyEditOpenFailed}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data ? (
        <EmptyState
          icon="book"
          title={strings.story.storyNotFound}
          description={strings.story.storyNotFoundDescription}
          action={
            <ButtonLink href="/stories" variant="secondary">
              {strings.story.backToStories}
            </ButtonLink>
          }
        />
      ) : (
        // Keyed by the story: a different story is a different form, and the
        // fields start from that story's own values rather than from the last
        // story's leftovers.
        <EditStoryForm key={query.data.id} story={query.data} />
      )}
    </div>
  );
}

/**
 * The form itself, with the story's values as its starting state.
 *
 * It is a separate component on purpose: the fields are seeded ONCE, when the
 * form mounts, so a refetch of the story in the background cannot overwrite what
 * the writer has typed since.
 */
function EditStoryForm({ story }: { story: Story }) {
  const router = useRouter();
  const { locale, strings } = useLocale();
  const invalidation = useInvalidation();
  const [title, setTitle] = useState(story.title);
  const [content, setContent] = useState(story.content || "");
  const [category, setCategory] = useState(story.category ?? "");
  const [tags, setTags] = useState((story.tags || []).join(", "));

  const updateStory = useMutation({
    mutationFn: (payload: StoryPatchInput) => api.updateStory(story.id, payload),
    onSuccess: async () => {
      await invalidation.stories(story.id);
      router.push(`/stories/${story.id}`);
    },
  });

  const remaining = TITLE_LIMIT - title.trim().length;
  const categories = storyCategories(locale);
  const options =
    category && !categories.some((option) => option.value === category)
      ? [...categories, { value: category, label: category }]
      : categories;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStory.mutate({
      title,
      content,
      category,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-5">
          {updateStory.isError && (
            <ErrorMessage
              error={strings.errors[classifyError(updateStory.error)]}
              title={strings.story.storyEditSaveFailed}
            />
          )}

          <Input
            label={strings.story.titleLabel}
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            hint={
              remaining <= 0
                ? strings.story.titleLimitReached
                : strings.story.titleRemaining(remaining)
            }
          />

          <Textarea
            label={strings.story.contentLabel}
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            hint={strings.story.contentEditHint}
          />

          <Select
            label={strings.story.storiesCategoryLabel}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={options}
          />

          <Input
            label={strings.story.tagsLabel}
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            hint={strings.story.tagsHint}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={updateStory.isPending}>
              {strings.story.editSubmitButton}
            </Button>
            <ButtonLink href={`/stories/${story.id}`} variant="ghost">
              {strings.story.cancelButton}
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
