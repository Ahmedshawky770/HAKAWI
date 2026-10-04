import React from "react";
import Link from "next/link";

import { StoryByline, StoryCategory } from "./StoryMeta";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Story } from "@/types/api";

/**
 * The story card of §6 — the component the whole feed is built from, so its
 * anatomy is fixed and its proportions are the ones `StoryCardSkeleton` copies:
 *
 * ```
 * ┌────────────────────────────────────────┐
 * │ [Cover Image]                          │  16:9, lazy, blurred in
 * │                                        │
 * │ Title                     (text-xl)    │
 * │ Excerpt, four lines       (text-sm)    │
 * │                                        │
 * │ Author · Category · Date               │
 * │ ❤ 42  💬 12  👁 1.2K                   │
 * └────────────────────────────────────────┘
 * ```
 *
 * Interaction, per §7:
 * - the whole card is one link target, so a reader on a phone does not have to
 *   aim at the title;
 * - hover is the amber/aqua glow from the motion table, and it is a transition,
 *   not an instant change;
 * - the reaction row carries live counts, and the accent heart marks the state.
 */
export function StoryCard({ story, showCover = true }: { story: Story; showCover?: boolean }) {
  return (
    <article className="group relative rounded-xl border border-line bg-surface transition-shadow duration-200 hover:border-chrome/30 hover:shadow-[var(--hk-glow-chrome)]">
      <Link href={`/stories/${story.id}`} className="block rounded-xl p-5 focus-visible:outline-2">
        {showCover && story.coverImage && (
          <div className="mb-4 overflow-hidden rounded-lg bg-surface-raised">
            <img
              src={story.coverImage}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        )}

        <h3 className="mb-2 text-xl font-bold text-ink transition-colors duration-200 group-hover:text-accent-ink">
          {story.title}
        </h3>

        {story.excerpt && (
          <p className="mb-4 line-clamp-4 text-sm leading-7 text-ink-muted">{story.excerpt}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <StoryByline author={story.author} />
          <span aria-hidden="true">·</span>
          <StoryCategory category={story.category} variant="inline" />
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Icon name="heart" size="sm" className="text-accent-ink" />
            <span className="hk-numeric">{story.reactions}</span>
            <span className="sr-only">تفاعل</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="eye" size="sm" />
            <span className="hk-numeric">{formatCompact(story.views)}</span>
            <span className="sr-only">مشاهدة</span>
          </span>
        </div>
      </Link>
    </article>
  );
}

/**
 * The compact variant for sidebars and multi-column grids. Same information,
 * no cover, so a grid of six does not become six hero images.
 */
export function StoryCardCompact({ story }: { story: Story }) {
  return (
    <article className="group relative rounded-xl border border-line bg-surface transition-colors duration-200 hover:border-chrome/30">
      <Link href={`/stories/${story.id}`} className="block rounded-xl p-4 focus-visible:outline-2">
        <h3 className="mb-2 text-lg font-semibold text-ink transition-colors duration-200 group-hover:text-accent-ink">
          {story.title}
        </h3>
        {story.excerpt && <p className="line-clamp-3 mb-3 text-sm text-ink-muted">{story.excerpt}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <StoryByline author={story.author} />
          <span aria-hidden="true">·</span>
          <span className="hk-numeric">{formatCompact(story.views)} مشاهدة</span>
        </div>
      </Link>
    </article>
  );
}

/** The placeholder for both variants, at the same height as the real thing. */
export function StoryCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="mb-4 h-48 w-full" rounded="rounded-lg" />
      <Skeleton className="mb-2 h-5 w-3/4" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
      <div className="mt-4 flex items-center gap-4">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

/**
 * A full feed of card placeholders, used while the first page is in flight and
 * appended at the end of an infinite scroll. `count` grows as pages arrive, so
 * the page height is roughly right before the data lands and the scrollbar does
 * not jump on arrival (Cumulative Layout Shift < 0.1, §10).
 */
export function StoryFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <StoryCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * `1.2K` instead of `1,204`.
 *
 * A view count is a magnitude, not an exact figure: rounding it saves four
 * characters per card and, more usefully, keeps the row from reflowing as the
 * number ticks. The exact figure stays available on the story page.
 */
export function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10} ألف`;
  }
  const millions = value / 1_000_000;
  return `${millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10} مليون`;
}
