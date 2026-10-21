"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { StoryMutationInput } from "@hakawi/shared-types";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { useInvalidation } from "@/lib/queries";
import { useToast } from "@/components/providers/ToastProvider";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Input";

/**
 * The composer card of §6, collapsed to a single invitation and expanded in
 * place.
 *
 * Why it lives on the feed rather than behind a link to `/stories/create`:
 * writing is the product's primary action, and a reader who has to navigate to
 * find it is a reader who does not write. The expanded state is the same form
 * the dedicated page renders — the two call one component, so validation and
 * the character counter cannot drift apart.
 *
 * Collapsed by default, and collapsing again after a publish, because a feed
 * with a permanent open editor pushes the content the reader came for off the
 * screen.
 *
 * THE WRITE INVALIDATES THE FEED. A published story is a fact the dashboard,
 * the stories grid and the trending rail all show, so the mutation retires
 * those cache entries instead of leaving the reader to press refresh.
 */
export function StoryCreatorCard() {
  const router = useRouter();
  const { notify } = useToast();
  const strings = useStrings();
  const invalidation = useInvalidation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  const remaining = 120 - title.trim().length;

  const createStory = useMutation({
    mutationFn: (payload: StoryMutationInput) => api.createStory(payload),
    onSuccess: (story) => {
      notify(strings.story.creatorPublishedToast, "success");
      setTitle("");
      setContent("");
      setTags("");
      setOpen(false);
      // WHY THE NAVIGATION GOES FIRST. `invalidateQueries` resolves only after
      // the refetches it triggered SETTLE, so awaiting it before the
      // navigation made the reader wait for two or three network round trips
      // before the story they had just written appeared. The page they land on
      // reads the story from the API when it mounts, so the invalidation is
      // not what makes the story visible THERE — it is what makes the feed and
      // the dashboard honest when the reader goes back to them. So the
      // navigation happens first and the invalidation runs behind it.
      router.push(`/stories/${story.id}`);
      // It is not awaited, so it must not be able to fail into the void: a
      // rejected refetch is a stale feed, not a broken write, and the write
      // itself already succeeded.
      void invalidation.stories(story.id).catch(() => undefined);
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createStory.mutate({
      title: title.trim(),
      content,
      category: "fiction",
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }

  if (!open) {
    return (
      <Card interactive className="p-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 text-start text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <Icon name="pen" size="sm" />
          </span>
          {strings.shell.writeSomething}
          <Icon name="plus" size="sm" className="ms-auto text-chrome-ink" />
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {createStory.isError && (
          <ErrorMessage
            error={strings.errors[classifyError(createStory.error)]}
            title={strings.story.storyPublishFailed}
          />
        )}

        <Input
          label={strings.story.titleLabel}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={strings.story.creatorTitlePlaceholder}
          required
          maxLength={120}
          hint={
            remaining <= 0 ? strings.story.titleLimitReached : strings.story.titleRemaining(remaining)
          }
        />

        <Textarea
          label={strings.story.creatorContentLabel}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={strings.shell.writeSomething}
          rows={6}
          required
        />

        <Input
          label={strings.story.creatorTagsLabel}
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={strings.story.creatorTagsPlaceholder}
          hint={strings.story.tagsHint}
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={createStory.isPending}>
            {strings.story.creatorSubmitButton}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {strings.story.creatorCloseButton}
          </Button>
        </div>
      </form>
    </Card>
  );
}
