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

export function CommentRow({ comment }: CommentRowProps) {
  const { intl } = useLocale();

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar name={comment.authorName ?? "مستخدم"} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">
              {comment.authorName ?? "مستخدم"}
            </p>
            <span className="text-xs text-ink-muted">{formatDate(comment.createdAt, intl)}</span>
          </div>
          <p className="mt-1 text-sm text-ink">{comment.content}</p>
          {comment.replyCount > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              <span className="hk-numeric">{comment.replyCount}</span> رد
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function CommentListEmpty() {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">لا توجد تعليقات بعد. كن أول من يعلق!</p>
    </Card>
  );
}
