"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import {
  NotificationListEmpty,
  NotificationListSkeleton,
  NotificationRow,
} from "@/components/social/NotificationRow";
import type { Notification } from "@/types/api";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications({ page: 1, limit: 20 });
      setNotifications(data.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الإشعارات");
      setLoading(false);
      return;
    }

    // The unread counter is a convenience, not the page: it lives on a separate
    // endpoint that can fail on its own (an older backend, a gateway hiccup), so
    // its failure is recorded as "unknown" and never as zero. Claiming zero would
    // hide unread notifications behind a counter that says everything is fine.
    try {
      const unread = await api.getUnreadNotificationCount();
      setUnreadCount(unread.count);
    } catch {
      setUnreadCount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  const handleMarkAsRead = async (id: string) => {
    setMarkingId(id);
    setMarkError("");
    try {
      await api.markNotificationAsRead(id);
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((current) => (current === null ? null : Math.max(0, current - 1)));
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "تعذّر تعليم الإشعار كمقروء");
    } finally {
      setMarkingId(null);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="الإشعارات" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
        </p>
        <NotificationListSkeleton />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={() => void load()} title="تعذّر تحميل الإشعارات" />;
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="الإشعارات"
        action={
          unreadCount === null ? (
            <span className="flex items-center gap-1.5 text-sm text-ink-muted">
              <Icon name="warning" size="sm" />
              تعذّر جلب العدد
            </span>
          ) : unreadCount > 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-ink-muted">
              <Icon name="bell" size="sm" />
              <span className="hk-numeric">{unreadCount}</span>
              <span>إشعار غير مقروء</span>
            </span>
          ) : undefined
        }
      />

      {markError && (
        <div className="mb-4">
          <ErrorMessage error={markError} title="تعذّر تعليم الإشعار كمقروء" />
        </div>
      )}

      {notifications.length === 0 ? (
        <NotificationListEmpty />
      ) : (
        <ul className="space-y-4">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <NotificationRow
                notification={notification}
                onMarkAsRead={(id) => void handleMarkAsRead(id)}
                isPending={markingId === notification.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}