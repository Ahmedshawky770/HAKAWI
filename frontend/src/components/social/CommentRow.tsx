"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatDate } from "@/lib/i18n";
import type { Comment } from "@/types/api";

interface CommentRowProps {
  comment: Comment;
}

/**
 * One comment.
 *
 * The comment's own words are NOT translated — a reader wrote them, and they
 * are shown exactly as they arrived. Everything the PRODUCT says about the
 * comment is said in the reader's language: the name of an author the API
 * sends without one, and the word the reply count is read with.
 *
 * The reply count is split into digits and noun (`CountReadout`) because the
 * digits sit inside the LTR isolate `.hk-numeric` and isolating a whole Arabic
 * phrase reorders the words around it — the rule `lib/i18n/common.ts` states.
 */
export function CommentRow({ comment }: CommentRowProps) {
  const { intl, strings } = useLocale();
  const { social } = strings;
  const author = comment.authorName?.trim() || social.authorFallback;
  const replies = social.commentReplies(comment.replyCount);

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar name={author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{author}</p>
            <span className="text-xs text-ink-muted">{formatDate(comment.createdAt, intl)}</span>
          </div>
          <p className="mt-1 text-sm text-ink">{comment.content}</p>
          {comment.replyCount > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              <span className="hk-numeric">{replies.count}</span> {replies.label}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function CommentListEmpty() {
  const { strings } = useLocale();

  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">{strings.social.commentListEmpty}</p>
    </Card>
  );
}
