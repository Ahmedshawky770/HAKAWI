"use client";

import React from "react";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import {
  NotificationListEmpty,
  NotificationListSkeleton,
  NotificationRow,
} from "@/components/social/NotificationRow";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import {
  isFailedLoad,
  useInvalidation,
  useNotifications,
  useUnreadNotificationCount,
} from "@/lib/queries";

export default function NotificationsPage() {
  const strings = useStrings();
  const invalidate = useInvalidation();

  const listQuery = useNotifications({ page: 1, limit: 20 });
  const unreadQuery = useUnreadNotificationCount();

  const markMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationAsRead(id),
    onSuccess: async () => {
      await invalidate.notifications();
    },
  });

  if (listQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.social.notificationsTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <NotificationListSkeleton />
      </>
    );
  }

  if (isFailedLoad(listQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(listQuery.error)]}
        title={strings.social.notificationsLoadFailed}
        onRetry={() => void listQuery.refetch()}
      />
    );
  }

  const notifications = listQuery.data?.notifications ?? [];
  // The counter is a convenience, not the page: it lives on a separate endpoint
  // that can fail on its own (an older backend, a gateway hiccup), so its
  // failure is reported as "unknown" and never as zero. Claiming zero would
  // hide unread notifications behind a counter that says everything is fine.
  const unreadCount = unreadQuery.isError ? null : (unreadQuery.data?.count ?? 0);

  return (
    <div className="animate-rise">
      <PageHeader
        title={strings.social.notificationsTitle}
        action={
          unreadCount === null ? (
            <span className="flex items-center gap-1.5 text-sm text-ink-muted">
              <Icon name="warning" size="sm" />
              {strings.social.notificationsUnreadCountFailed}
            </span>
          ) : unreadCount > 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-ink-muted">
              <Icon name="bell" size="sm" />
              <span className="hk-numeric">{unreadCount}</span>
              <span>{strings.social.notificationsUnreadLabel}</span>
            </span>
          ) : undefined
        }
      />

      {markMutation.isError && (
        <div className="mb-4">
          <ErrorMessage
            error={strings.errors[classifyError(markMutation.error)]}
            title={strings.social.notificationMarkAsReadFailed}
          />
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
                onMarkAsRead={(id) => markMutation.mutate(id)}
                isPending={markMutation.isPending && markMutation.variables === notification.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
