"use client";

import React from "react";

/**
 * The unread counter that sits on top of a navigation target.
 *
 * WHY IT IS HERE. `getUnreadNotificationCount` existed and the notifications
 * PAGE used it, so the product knew how many notifications were unread and
 * then told nobody: a message waiting in a chat and a notification waiting in
 * a bell were both invisible until the reader went looking for them. On a
 * platform where people talk to each other, the counter IS the notification —
 * a reader is not going to open a bell to find out whether the bell has
 * anything in it.
 *
 * IT IS POSITIONED, NOT IN THE FLOW. The badge is absolutely placed over the
 * icon, so a header that gains one does not reflow when the count arrives:
 * content that moves under the reader's thumb because a number changed is a
 * worse defect than a missing number.
 *
 * THE COUNT IS A NUMBER AND A WORD. The number is what a reader reads; the
 * word is what a screen reader reads, because "3" alone says nothing about
 * what is being counted.
 */
export function UnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;

  return (
    <span className="pointer-events-none absolute -end-1.5 -top-1 flex min-w-5 items-center justify-center rounded-full bg-accent-fill px-1.5 text-[10px] font-bold leading-5 text-on-accent">
      {/* The visible digits are decoration for a screen reader: the sentence
          below carries the count AND the thing being counted, so the reader
          hears "3 رسائل غير مقروءة" rather than "3 3 رسائل غير مقروءة". */}
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{`${count} ${label}`}</span>
    </span>
  );
}
