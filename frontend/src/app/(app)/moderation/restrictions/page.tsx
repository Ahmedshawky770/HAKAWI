"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";

/**
 * The user restrictions page.
 *
 * WHY THIS PAGE EXISTS. A reader who has been restricted needs a first-class place
 * to see what the restriction is, when it was applied, and when (or if) it expires.
 * This page shows the restrictions for the currently authenticated user only.
 */
export default function UserRestrictionsPage() {
  const [restrictions, setRestrictions] = useState<{ id: string; action: string; reason: string; expiresAt: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const currentUserId = getStoredUser()?.id;

  const load = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const data = await api.getUserRestrictions(currentUserId, { includeExpired: true });
      setRestrictions(data.restrictions);
    } catch {
      setError("فشل تحميل القيود");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    async function loadRestrictions() {
      if (!currentUserId) return;
      try {
        const data = await api.getUserRestrictions(currentUserId, { includeExpired: true });
        if (active) setRestrictions(data.restrictions);
      } catch {
        if (active) setError("فشل تحميل القيود");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRestrictions();
    return () => {
      active = false;
    };
  }, [currentUserId]);

  if (loading) {
    return (
      <>
        <PageHeader title="القيود المفروضة" />
        <Loading />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={() => { setLoading(true); setError(""); void load(); }} title="فشل تحميل القيود" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="القيود المفروضة" description="عرض القيود المرتبطة بحسابك." />

      {restrictions.length === 0 ? (
        <p className="text-sm text-ink-muted">لا توجد قيود مفروضة على حسابك.</p>
      ) : (
        <ul className="space-y-3">
          {restrictions.map((restriction) => (
            <li key={restriction.id} className="rounded-lg border border-line p-4">
              <p className="font-medium text-ink">الإجراء: {restriction.action}</p>
              <p className="text-sm text-ink-muted">السبب: {restriction.reason}</p>
              {restriction.expiresAt && (
                <p className="text-sm text-ink-muted">تنتهي في: {new Date(restriction.expiresAt).toLocaleString("ar-EG")}</p>
              )}
              <p className="text-sm text-ink-muted">تاريخ الإنشاء: {new Date(restriction.createdAt).toLocaleString("ar-EG")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
