"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";
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
 * The category list gains the story's own category when it is not one of the four
 * known values. A `<select>` can only show its own options, so a story filed under
 * any other category used to display the first option while submitting the real
 * one — the control disagreed with the payload, and the writer could not tell which
 * of the two the server would store.
 *
 * Submission is unchanged: the same `api.updateStory` payload, the same redirect to
 * the story.
 */
export default function EditStoryPage() {
  const params = useParams();
  const router = useRouter();
  const { locale, strings } = useLocale();
  const id = typeof params.id === "string" ? params.id : "";

  const [story, setStory] = useState<Story | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fiction");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  // The load is keyed on the story id alone: `strings` changes object identity
  // when the locale flips, so a `load` that depended on the copy would re-run on
  // a language toggle and refetch the story — discarding whatever the writer had
  // typed since. The fallback message is read through a ref kept in step by the
  // effect below instead, the same pattern `auth/callback/page.tsx` uses for its
  // one-shot completion effect.
  const editLoadFailed = strings.story.storyEditLoadFailed;
  const editLoadFailedRef = useRef(editLoadFailed);

  useEffect(() => {
    editLoadFailedRef.current = editLoadFailed;
  }, [editLoadFailed]);

  const load = useCallback(() => {
    api
      .getStory(id)
      .then(
        (data) => {
          setStory(data);
          setTitle(data.title);
          setContent(data.content || "");
          setCategory(data.category ?? "");
          setTags((data.tags || []).join(", "));
        },
        (failure) => setLoadError(failure instanceof Error ? failure.message : editLoadFailedRef.current),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Retry owns the "start again" state, so the mounting effect stays async-only. */
  function retry() {
    setLoading(true);
    setLoadError("");
    void load();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      await api.updateStory(id, {
        title,
        content,
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      router.push(`/stories/${id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : strings.story.storyEditUpdateFailed);
    } finally {
      setSaving(false);
    }
  };

  const remaining = TITLE_LIMIT - title.trim().length;
  const categories = storyCategories(locale);
  const options =
    category && !categories.some((option) => option.value === category)
      ? [...categories, { value: category, label: category }]
      : categories;

  return (
    <div>
      <PageHeader
        title={strings.story.editPageTitle}
        description={strings.story.editPageDescription}
      />

      {loading ? (
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
      ) : loadError ? (
        <ErrorMessage
          error={loadError}
          title={strings.story.storyEditOpenFailed}
          onRetry={retry}
        />
      ) : !story ? (
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
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && <ErrorMessage error={formError} title={strings.story.storyEditSaveFailed} />}

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
                <Button type="submit" loading={saving}>
                  {strings.story.editSubmitButton}
                </Button>
                <ButtonLink href={`/stories/${id}`} variant="ghost">
                  {strings.story.cancelButton}
                </ButtonLink>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}