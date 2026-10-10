"use client";

import React from "react";

import type { Message } from "@/types/api";

/**
 * One message bubble.
 *
 * Own messages take the accent pair — `bg-accent-fill` with `text-on-accent`,
 * which is the fill and its only legible text colour as a pair, not two
 * independent choices. Everyone else's take the raised surface, so the reader's
 * own voice is the one warm shape in the thread.
 *
 * `justify-end` / `justify-start` are the flex alignment of the row, not a
 * physical direction: in an RTL container `end` is the left edge, so these stay
 * correct without a `left`/`right` anywhere.
 *
 * AUTHOR METADATA, AND WHY IT IS ONLY EVER "أنت". `MessagesListResponse`
 * carries `senderId` and no author summary, so the thread cannot name the other
 * participant without a second request (`api.getConversation` does not exist),
 * and this migration keeps the request set unchanged. The reader's own messages
 * are labelled instead; the other side is named by the conversation it belongs
 * to.
 */
export function MessageBubble({
  message,
  isOwn,
  intl,
}: {
  message: Message;
  isOwn: boolean;
  intl: string;
}) {
  return (
    <li className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 ${
          isOwn ? "bg-accent-fill text-on-accent" : "bg-surface-raised text-ink"
        }`}
      >
        {isOwn && <p className="mb-1 text-xs font-medium text-on-accent/80">أنت</p>}
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p>
        <p className={`hk-numeric mt-1 text-xs ${isOwn ? "text-on-accent/80" : "text-ink-muted"}`}>
          {new Date(message.createdAt).toLocaleTimeString(intl)}
        </p>
      </div>
    </li>
  );
}