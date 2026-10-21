"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { StoryMutationInput } from "@hakawi/shared-types";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { useInvalidation } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { storyCategories } from "@/components/story/StoryCategoryOptions";
import { useLocale } from "@/components/providers/LocaleProvider";

/** The same ceiling the inline composer enforces, so the two forms cannot drift. */
const TITLE_LIMIT = 120;

/**
 * The create-story form.
 *
 * ONE CARD, ONE FORM. The old page hand-rolled a `<label>` + `<textarea>` and a
 * `<label>` + `<select>` with raw focus rings while the two neighbouring fields
 * used the shared controls — so the title was announced one way and the body
 * another. Every field here is the shared control, which means every label,
 * error and `aria-describedby` is wired by one implementation.
 *
 * The character counter is a `hint`, not a paragraph next to the label: it is
 * part of the field's description, so it is announced with it and it occupies the
 * row the error message will take, which is why the form does not jump when a
 * field fails.
 *
 * Submission is unchanged: the same `api.createStory` payload, the same redirect
 * to the new story. What changed is what happens around it — the write is a
 * mutation, so the feed the story will appear in is invalidated as the redirect
 * happens, and a failure no longer disappears: it is announced at the top of the
 * form with the typed values still in place, so the writer can correct one
 * field instead of retyping the story.
 */
export default function CreateStoryPage() {
  const router = useRouter();
  const { locale, strings } = useLocale();
  const invalidation = useInvalidation();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fiction");
  const [tags, setTags] = useState("");

  const remaining = TITLE_LIMIT - title.trim().length;

  const createStory = useMutation({
    mutationFn: (payload: StoryMutationInput) => api.createStory(payload),
    onSuccess: (story) => {
      // WHY THE NAVIGATION GOES FIRST. `invalidateQueries` resolves only after
      // the refetches it triggered SETTLE, so awaiting it before the
      // navigation made the writer wait for two or three network round trips
      // before the story they had just written appeared. The page they land on
      // reads the story from the API when it mounts, so the invalidation is
      // not what makes the story visible THERE — it is what makes the feed and
      // the dashboard honest when the writer goes back to them. So the
      // navigation happens first and the invalidation runs behind it.
      router.push(`/stories/${story.id}`);
      // It is not awaited, so it must not be able to fail into the void: a
      // rejected refetch is a stale feed, not a broken write, and the write
      // itself already succeeded.
      void invalidation.stories(story.id).catch(() => undefined);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createStory.mutate({
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
    <div>
      <PageHeader
        title={strings.story.createPageTitle}
        description={strings.story.createPageDescription}
      />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {createStory.isError && (
              <ErrorMessage
                error={strings.errors[classifyError(createStory.error)]}
                title={strings.story.storyPublishFailed}
              />
            )}

            <Input
              label={strings.story.titleLabel}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={strings.story.titlePlaceholder}
              hint={
                remaining <= 0
                  ? strings.story.titleLimitReached
                  : strings.story.titleRemaining(remaining)
              }
            />

            <Textarea
              label={strings.story.contentLabel}
              rows={10}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={strings.story.contentPlaceholder}
              hint={strings.story.contentHint}
            />

            <Select
              label={strings.story.storiesCategoryLabel}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={storyCategories(locale)}
            />

            <Input
              label={strings.story.tagsLabel}
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={strings.story.tagsPlaceholder}
              hint={strings.story.tagsHint}
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={createStory.isPending}>
                {strings.story.createSubmitButton}
              </Button>
              <ButtonLink href="/stories" variant="ghost">
                {strings.story.cancelButton}
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
