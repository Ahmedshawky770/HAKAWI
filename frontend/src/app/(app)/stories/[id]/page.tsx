"use client";

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { api, getStoredUser } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ReactionBar } from "@/components/story/ReactionBar";
import { StoryByline, StoryCategory, StoryDate } from "@/components/story/StoryMeta";
import type { Story } from "@/types/api";

/** Nothing in this page's lifetime changes the signed-in user; the guard
 *  navigates away when the session ends. */
const noopSubscribe = () => () => undefined;

/**
 * The signed-in reader's id, or `null` when nobody is signed in.
 *
 * Read through `useSyncExternalStore` rather than during render or in an effect:
 * local storage does not exist on the server, so a render-time read renders the
 * owner controls on the client that are missing from the HTML React hydrated, and
 * an effect that sets state afterwards is a cascading render for a value that is
 * already known by the time the page paints. The store gives the server `null`
 * and the client the real id, which is the same pattern `LocaleProvider` uses for
 * `<html lang>`.
 */
function useViewerId(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => getStoredUser()?.id ?? null,
    () => null,
  );
}

/**
 * The reading surface.
 *
 * `story.content` is HTML the API owns, so it is rendered as markup inside
 * `.hk-prose` — the class that styles every descendant (headings, blockquotes,
 * lists, links) in the reading face at the reading measure. A component
 * `className` could not reach inside it.
 *
 * WHAT IS HERE, IN ORDER: the way back, the category, the title, the author and
 * the date, the body, then the two things a reader does with a story they have
 * finished — react, and (for the writer) edit or delete. Reactions are the amber
 * row of §3: `ReactionBar` owns the six types, the optimistic update and the
 * failure toast, so this page never re-implements any of it.
 *
 * The owner affordances are gated on what the data actually says. The story
 * payload carries the author's id and the signed-in user is in local storage, so
 * "is this my story" is answerable — and when it is not answerable (nobody
 * signed in, or the ids are absent) no edit or delete control is rendered at all.
 * A destructive control that appears for a story it does not own is worse than no
 * control, so deletion is also two-step: the first click arms it, the second
 * commits.
 */
export default function StoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { notify } = useToast();
  const { intl } = useLocale();
  const id = typeof params.id === "string" ? params.id : "";

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const viewerId = useViewerId();

  const load = useCallback(() => {
    api
      .getStory(id)
      .then(
        (data) => setStory(data),
        (failure) => setError(failure instanceof Error ? failure.message : "فشل تحميل القصة"),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Retry owns the "start again" state, so the mounting effect stays async-only. */
  function retry() {
    setLoading(true);
    setError("");
    void load();
  }

  const isOwner = story !== null && viewerId !== null && story.author.id === viewerId;

  async function handleDelete() {
    if (!story) return;
    setDeleting(true);
    try {
      await api.deleteStory(story.id);
      notify("تم حذف القصة", "success");
      router.push("/stories");
    } catch (err) {
      notify(err instanceof Error ? err.message : "تعذّر حذف القصة", "error");
      setDeleteArmed(false);
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link
        href="/stories"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-chrome-ink transition-colors duration-200 hover:text-chrome-hover"
      >
        <Icon name="chevron" size="sm" />
        العودة للقصص
      </Link>

      {loading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            جارٍ التحميل…
          </span>
          <Card className="p-6 sm:p-8">
            <Skeleton className="mb-4 h-6 w-24" rounded="rounded-full" />
            <Skeleton className="mb-6 h-9 w-3/4" />
            <div className="mb-6 flex items-center gap-3">
              <Skeleton className="size-10 shrink-0" rounded="rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-4 w-full" />
              ))}
            </div>
          </Card>
        </div>
      ) : error ? (
        <ErrorMessage
          error={error}
          title="تعذّر فتح القصة"
          onRetry={retry}
          retryLabel="أعد المحاولة"
        />
      ) : !story ? (
        <EmptyState
          icon="book"
          title="القصة غير موجودة"
          description="ربما حُذفت أو تغيّر رابطها."
          action={
            <ButtonLink href="/stories" variant="secondary">
              العودة للقصص
            </ButtonLink>
          }
        />
      ) : (
        <Card as="article" className="p-6 sm:p-8">
          <header>
            <StoryCategory category={story.category} className="mb-3 inline-block" />
            <h1 className="text-3xl font-bold text-ink">{story.title}</h1>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={story.author.name ?? ""} />
                <div className="min-w-0">
                  <StoryByline author={story.author} linkToProfile className="text-sm" />
                  <StoryDate value={story.createdAt} intl={intl} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="eye" size="sm" />
                  <span className="hk-numeric">{story.views.toLocaleString()}</span> مشاهدة
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="heart" size="sm" className="text-accent-ink" />
                  <span className="hk-numeric">{story.reactions}</span> تفاعل
                </span>
              </div>
            </div>
          </header>

          <div className="hk-prose mt-8">
            {story.content ? (
              <div dangerouslySetInnerHTML={{ __html: story.content }} />
            ) : (
              <p className="italic text-ink-muted">لا يوجد محتوى</p>
            )}
          </div>

          <footer className="mt-8 border-t border-line pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ReactionBar storyId={story.id} fallbackCount={story.reactions} />

              {isOwner && (
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonLink href={`/stories/${story.id}/edit`} variant="secondary" size="sm">
                    <Icon name="edit" size="sm" />
                    تعديل القصة
                  </ButtonLink>
                  <Button
                    variant={deleteArmed ? "danger" : "ghost"}
                    size="sm"
                    loading={deleting}
                    onClick={() => (deleteArmed ? void handleDelete() : setDeleteArmed(true))}
                  >
                    <Icon name="trash" size="sm" />
                    {deleteArmed ? "تأكيد الحذف" : "حذف القصة"}
                  </Button>
                  {deleteArmed && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleteArmed(false)}>
                      تراجع
                    </Button>
                  )}
                </div>
              )}
            </div>
          </footer>
        </Card>
      )}
    </div>
  );
}