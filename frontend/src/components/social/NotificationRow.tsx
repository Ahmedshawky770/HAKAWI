import React from "react";
import Image from "next/image";
import { isNotificationType } from "@hakawi/shared-types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { IconName } from "@/components/ui/Icon";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { useLocale, useStrings } from "@/components/providers/LocaleProvider";
import { badgeNotificationCopy } from "@/lib/badges";
import { formatDateTime } from "@/lib/i18n";
import type { Notification } from "@/types/api";

/**
 * A notification row.
 *
 * The unread state is carried by three things, not by one: an accent border on
 * the inline-start edge, the accent background, and the word "New". Colour on
 * its own is not an accessible signal — roughly one reader in twelve cannot
 * separate the amber edge from the surface it sits on — so the text is the
 * state and the colour is the emphasis.
 *
 * The border is `border-s-*`, the logical edge. A `border-l-*` would put the
 * marker on the wrong side the moment the locale flips to English.
 *
 * The timestamp is `formatDateTime(..., intl)` from `lib/i18n`, like every other
 * date in the product: the runtime's default locale differs between Node and the
 * browser, so a bare `toLocaleString()` hydrates one shape and renders another.
 * The earlier version of this comment claimed the row could not read the locale
 * context because the page's test rendered it under a bare stack; that test now
 * uses `renderWithProviders`, so the constraint it described no longer exists.
 */
export function NotificationRow({
  notification,
  onMarkAsRead,
  isPending = false,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  isPending?: boolean;
}) {
  const { intl, locale } = useLocale();
  const strings = useStrings();
  const unread = !notification.isRead;

  // Badge notifications carry a `badgeKey` in their payload, so their title and
  // message are re-derived from the current locale instead of the (possibly
  // stale, possibly English) text frozen into the row at creation time. That is
  // what lets them follow the site language after the fact.
  let title = notification.title;
  let message = notification.message;
  if (notification.type === "badge.awarded") {
    const badgeKey = notification.data?.badgeKey;
    if (typeof badgeKey === "string") {
      const copy = badgeNotificationCopy(locale, badgeKey);
      title = copy.title;
      message = copy.message;
    }
  }

  return (
    <Card className={unread ? "border-s-2 border-s-accent bg-accent-soft" : ""}>
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted">
          <Image
            src={notificationIconSrc(notification.type, unread)}
            alt=""
            width={32}
            height={32}
            className="size-8 object-contain"
            unoptimized
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {unread && <Badge tone="accent">{strings.social.notificationNewBadge}</Badge>}
          </div>
          <p className="mt-1 text-sm leading-7 text-ink-muted">{message}</p>
          <p className="hk-numeric mt-2 text-xs text-ink-faint">
            {formatDateTime(notification.createdAt, intl)}
          </p>
        </div>

        {unread && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            loading={isPending}
            onClick={() => onMarkAsRead(notification.id)}
          >
            {strings.social.notificationMarkAsRead}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * The glyph for a notification kind.
 *
 * `NOTIFICATION_TYPES` is the contract in `packages/shared-types/src/social.ts`;
 * an unrecognised type falls back to the bell rather than rendering nothing,
 * because an unlabelled icon reads as a broken image.
 */
const TYPE_ICONS: Record<string, IconName> = {
  message: "message",
  comment: "comment",
  comment_reply: "comment",
  follow: "users",
  mention: "comment",
  contest: "trophy",
  payment: "wallet",
  system: "bell",
};

export function notificationIcon(type: string): IconName {
   if (type === "badge.awarded") return "trophy";
   if (isNotificationType(type)) return TYPE_ICONS[type] ?? "bell";
   return "bell";
}

/**
 * The SVG asset for a notification kind, chosen from the dedicated
 * notification icon set in `public/notification-icons`. The unread variant
 * carries the unread marker dot, so the glyph itself communicates state rather
 * than relying on colour alone.
 */
const NOTIFICATION_ICON_SLUGS: Record<string, string> = {
  "badge.awarded": "02-award",
  contest: "02-award",
  payment: "02-award",
  follow: "03-follow",
  story_reaction: "04-like",
  comment_reaction: "04-like",
  like: "04-like",
  comment: "05-comment",
  comment_reply: "05-comment",
  mention: "05-comment",
  repost: "06-repost",
  story_repost: "06-repost",
  bookmark: "07-bookmark",
  story_bookmarked: "07-bookmark",
  story_published: "08-new-story",
  new_story: "08-new-story",
  message: "01-bell",
  system: "01-bell",
};

export function notificationIconSrc(type: string, unread = false): string {
  const slug = NOTIFICATION_ICON_SLUGS[type] ?? "01-bell";
  return `/notification-icons/${slug}${unread ? "-unread" : ""}.svg`;
}

export function NotificationListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function NotificationListEmpty() {
  const strings = useStrings();

  return (
    <EmptyState
      icon="bell"
      title={strings.social.notificationsEmptyTitle}
      description={strings.social.notificationsEmptyDescription}
    />
  );
}