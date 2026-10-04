"use client";

import React from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { CardLink } from "@/components/ui/Card";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Contest } from "@/types/api";

import { ContestStatusBadge } from "./ContestStatusBadge";

/**
 * One contest, as a card.
 *
 * `CardLink` rather than a `Link` around a `Card`: the whole surface is the link
 * target, which is what a phone needs, and there is exactly one interactive
 * element in the tree because the status is a `Badge` and not a control.
 *
 * The date range is `hk-numeric` because `toLocaleDateString("ar-EG")` emits
 * Arabic-Indic digits and a set of directional marks; isolating the value keeps
 * the pair from being reordered by the surrounding RTL sentence.
 */
export function ContestCard({ contest }: { contest: Contest }) {
  const { intl } = useLocale();

  return (
    <CardLink href={`/contests/${contest.id}`} className="h-full">
      <div className="flex h-full flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-xl font-bold text-ink">{contest.title}</h2>
          <ContestStatusBadge status={contest.status} />
        </div>

        {contest.description && (
          <p className="line-clamp-2 text-sm leading-7 text-ink-muted">{contest.description}</p>
        )}

        <p className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-ink-muted">
          <Icon name="calendar" size="sm" />
          <span className="hk-numeric">{new Date(contest.startDate).toLocaleDateString(intl)}</span>
          <span aria-hidden="true">—</span>
          <span className="sr-only">إلى</span>
          <span className="hk-numeric">{new Date(contest.endDate).toLocaleDateString(intl)}</span>
        </p>
      </div>
    </CardLink>
  );
}

/** The placeholder, at the height of the card it replaces. */
export function ContestCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-6 w-20" rounded="rounded-full" />
      </div>
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-5/6" />
      <Skeleton className="mt-4 h-3 w-40" />
    </div>
  );
}

export function ContestListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ContestCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ContestListEmpty() {
  return (
    <EmptyState
      icon="trophy"
      title="لا توجد مسابقات بعد"
      description="تابع الحكاوي ليصلك إشعار فور انطلاق المسابقة القادمة."
    />
  );
}