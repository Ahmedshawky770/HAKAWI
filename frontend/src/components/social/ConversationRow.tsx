"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CardLink } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import type { Conversation } from "@/types/api";

/**
 * One conversation.
 *
 * The unread count is a `Badge` with an `sr-only` label, because a bare number
 * in a corner is announced as "3" with no idea of what it counts — and the
 * number alone is also the one thing on this row that must be read in figures
 * rather than words, which is what `hk-numeric` is for.
 *
 * `aria-current` is deliberately absent: it names the current member of a set,
 * and while the index is open no conversation is the current page. It belongs on
 * the conversation link in a navigation rail, not on a list of siblings.
 */
export function ConversationRow({ conversation }: { conversation: Conversation }) {
  return (
    <CardLink href={`/messages/${conversation.id}`} className="h-full">
      <div className="flex items-center gap-4 p-4">
        <Avatar name={conversation.participant.name ?? ""} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">
            {conversation.participant.name ?? "مستخدم"}
          </p>
          <p className="truncate text-sm text-ink-muted">
            {conversation.lastMessage?.content ?? "لا توجد رسائل بعد"}
          </p>
        </div>

        {conversation.unreadCount > 0 && (
          <Badge tone="accent" className="shrink-0">
            <span className="hk-numeric">{conversation.unreadCount}</span>
            <span className="sr-only">رسائل غير مقروءة</span>
          </Badge>
        )}
      </div>
    </CardLink>
  );
}

export function ConversationListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function ConversationListEmpty() {
  return (
    <EmptyState
      icon="message"
      title="لا توجد محادثات بعد"
      description="ابدأ محادثة من صفحة كاتب أي قصة، وستظهر هنا."
    />
  );
}