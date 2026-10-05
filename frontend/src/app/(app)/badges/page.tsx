"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { BadgeCard, BadgeGridSkeleton } from "@/components/social/BadgeCard";
import type { BadgeCatalogEntry } from "@hakawi/shared-types";

/**
 * The badge catalogue.
 *
 * WHY THIS PAGE EXISTS. Badges are the product's gamification layer — they tell a reader
 * what the platform values and how to earn it. This page lists every badge the engine
 * knows about, so a reader can see the catalogue without needing to earn one first.
 */
export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.listBadges();
      setBadges(data.badges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحميل الشارات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadBadges() {
      try {
        const data = await api.listBadges();
        if (active) setBadges(data.badges);
      } catch {
        if (active) setError("فشل تحميل الشارات");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadBadges();
    return () => {
      active = false;
    };
  }, []);

  const retry = () => {
    setLoading(true);
    setError("");
    void load();
  };

  if (loading) {
    return (
      <>
        <PageHeader title="الشارات" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
        </p>
        <BadgeGridSkeleton count={6} />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} title="فشل تحميل الشارات" />;
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="الشارات"
        description="اكتشف الشارات التي يمكنك كسبها من خلال التفاعل مع حكاوي."
      />

      {badges.length === 0 ? (
        <div className="text-center text-ink-muted">لا توجد شارات بعد.</div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {badges.map((badge) => (
            <li key={badge.key}>
              <BadgeCard badge={badge} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
