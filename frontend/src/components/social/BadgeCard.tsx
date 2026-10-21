"use client";

import React from "react";

import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useStrings } from "@/components/providers/LocaleProvider";
import type { BadgeCatalogEntry } from "@hakawi/shared-types";

/**
 * One badge, as a card.
 *
 * WHY THIS COMPONENT EXISTS. The badges page needs a consistent surface for each
 * entry in the catalogue, with the same border, padding and type scale as the
 * other catalogue cards in the product.
 *
 * THE BADGE'S OWN WORDS ARE NOT TRANSLATED. The name, the description and the
 * trigger are the badge engine's own vocabulary, written when the badge was
 * authored; only the frame around them — the word "Threshold" and the pill that
 * says the reader has earned it — is the product's copy, and it comes from the
 * dictionary.
 */
export function BadgeCard({ badge, isEarned = false }: { badge: BadgeCatalogEntry; isEarned?: boolean }) {
  const strings = useStrings();

  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-4">
          {badge.icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-raised text-2xl">
              {badge.icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-ink">{badge.name}</h3>
              {isEarned && <Badge tone="success">{strings.profile.badgeEarned}</Badge>}
            </div>
            <p className="mt-1 text-sm leading-7 text-ink-muted">{badge.description}</p>
            <p className="mt-2 text-xs text-ink-faint">
              {strings.profile.badgeThresholdLabel(badge.threshold)} • {badge.trigger}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function BadgeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-surface-raised" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-surface-raised" />
              <div className="h-3 w-full rounded bg-surface-raised" />
              <div className="h-3 w-1/2 rounded bg-surface-raised" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
