"use client";

import React from "react";

import { Badge } from "@/components/ui/Badge";
import { CardLink } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { SearchResult } from "@/types/api";

/**
 * One search result.
 *
 * `SearchResult` (`packages/shared-types/src/search.ts`) describes a story and
 * nothing else: it carries `slug`, `views`, `reactions`, `excerpt` and `author`,
 * and the two other search shapes the backend offers —
 * `AuthorSearchResult` and `CategorySearchResult` — come from different routes
 * that `api.search` does not call. So every row here is a story and every row
 * links to `/stories/{id}`.
 *
 * The link is a `CardLink` rather than a `Link` wrapping a `Card`, so the row is
 * one interactive element rather than a card nested inside a link. The status
 * pill is inside the card because it describes the result; nothing inside the
 * card is itself a control.
 */
export function SearchResultCard({ result }: { result: SearchResult }) {
  const { intl } = useLocale();

  return (
    <li>
      <CardLink href={`/stories/${result.id}`} className="h-full">
        <div className="flex h-full flex-col gap-2 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">{result.title}</h2>
            <Badge tone={result.status === "published" ? "success" : "neutral"}>
              {result.status === "published" ? "منشورة" : "غير منشورة"}
            </Badge>
          </div>

          {result.excerpt && (
            <p className="line-clamp-2 text-sm leading-7 text-ink-muted">{result.excerpt}</p>
          )}

          <p className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-ink-muted">
            <span>{result.author?.name ?? "مؤلف مجهول"}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Icon name="eye" size="sm" />
              <span className="hk-numeric">{result.views}</span>
              <span className="sr-only">مشاهدة</span>
            </span>
            <span className="flex items-center gap-1">
              <Icon name="heart" size="sm" />
              <span className="hk-numeric">{result.reactions}</span>
              <span className="sr-only">تفاعل</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="hk-numeric">{new Date(result.createdAt).toLocaleDateString(intl)}</span>
          </p>
        </div>
      </CardLink>
    </li>
  );
}

export function SearchResultSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-2/3" />
      <Skeleton className="mt-4 h-3 w-40" />
    </div>
  );
}

export function SearchResultsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <SearchResultSkeleton key={index} />
      ))}
    </div>
  );
}