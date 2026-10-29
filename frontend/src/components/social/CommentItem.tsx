"use client";

import React, { useCallback, useState } from "react";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { useCommentReplies, useInvalidation } from "@/lib/queries";
import { useStoredUser } from "@/lib/use-stored-user";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/i18n";
import { CommentForm } from "@/components/social/CommentForm";
import { CommentReactions } from "@/components/social/CommentReactions";
import { CommentThread } from "@/components/social/CommentThread";
import type { Comment } from "@/types/api";

interface CommentItemProps {
  comment: Comment;
  storyId: string;
  depth?: number;
  onCommentDeleted?: (commentId: string) => void;
  className?: string;
  /** Pre-fetched replies from the parent CommentsSection (avoids N+1 requests). */
  replies?: Comment[];
}

const MAX_REPLY_DEPTH = 1;

export function CommentItem({
  comment,
  storyId,
  depth = 0,
  onCommentDeleted,
  className = "",
  replies: preFetchedReplies,
}: CommentItemProps) {
  const { notify } = useToast();
  const { intl, strings } = useLocale();
  const social = strings.social;
  const viewer = useStoredUser();
  const invalidation = useInvalidation();

  const [replyOpen, setReplyOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);

  const isOwner = viewer !== null && comment.authorId === viewer.id;
  const canReply = depth < MAX_REPLY_DEPTH;

  const author = comment.authorName?.trim() || social.authorFallback;
  const isOwnLabel = viewer !== null && comment.authorId === viewer.id ? social.commentOwnLabel : author;

  const { data: repliesData, isLoading: repliesLoading } = useCommentReplies(comment.id, {
    page: 1,
    limit: 50,
    enabled: repliesOpen,
  });

  const fetchedReplies = repliesData?.replies ?? [];
  const effectiveReplies = preFetchedReplies ?? fetchedReplies;

  const handleDelete = async () => {
    if (!comment.id) return;
    setDeleting(true);
    try {
      await api.deleteComment(storyId, comment.id);
      notify(social.commentDeletedAnnouncement, "success");
      await invalidation.comments(storyId);
      onCommentDeleted?.(comment.id);
      setDeleteArmed(false);
    } catch (err) {
      const message = classifyError(err);
      notify(strings.errors[message] ?? social.commentDeleteFailed, "error");
    } finally {
      setDeleting(false);
      setDeleteArmed(false);
    }
  };

  const handleReplyCreated = useCallback(
    () => {
      setReplyOpen(false);
      void invalidation.comments(storyId);
    },
    [storyId, invalidation],
  );

  const handleCommentUpdated = useCallback(
    () => {
      setEditing(false);
      void invalidation.comments(storyId);
    },
    [storyId, invalidation],
  );

  return (
    <article
      className={`flex gap-3 ${className}`.trim()}
      style={{ marginLeft: depth > 0 ? "1.25rem" : 0 }}
    >
      <Card className="p-4 flex-1 min-w-0">
        <div className="flex gap-3">
          <Avatar name={author} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="truncate text-sm font-semibold text-ink">{isOwnLabel}</p>
              {isOwner && (
                <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                  {social.commentOwnLabel}
                </span>
              )}
              <time dateTime={comment.createdAt} className="text-xs text-ink-muted">
                {formatDate(comment.createdAt, intl)}
              </time>
            </div>
            <p className="text-sm text-ink break-words">{comment.content}</p>

            <footer className="mt-3 flex flex-wrap items-center gap-3">
              {comment.replyCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRepliesOpen((open) => !open)}
                >
                  <Icon name="comment" size="sm" className="mr-1" />
                  {social.commentReplies(comment.replyCount).count} {social.commentReplies(comment.replyCount).label}
                </Button>
              )}

              <CommentReactions commentId={comment.id} className="flex-1 justify-end" />

              {isOwner && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(true)}
                  >
                    <Icon name="pen" size="sm" />
                    {social.commentEditButton}
                  </Button>
                  <Button
                    type="button"
                    variant={deleteArmed ? "danger" : "ghost"}
                    size="sm"
                    onClick={() => (deleteArmed ? void handleDelete() : setDeleteArmed(true))}
                    loading={deleting}
                  >
                    <Icon name="trash" size="sm" />
                    {deleteArmed ? social.commentDeleteConfirmButton : social.commentDeleteButton}
                  </Button>
                  {deleteArmed && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteArmed(false)}
                    >
                      {social.commentDeleteUndoButton}
                    </Button>
                  )}
                </div>
              )}
            </footer>
          </div>
        </div>

        {editing && isOwner && (
          <CommentForm
            storyId={storyId}
            editingComment={comment}
            onCommentUpdated={handleCommentUpdated}
            className="mt-4"
          />
        )}

        {replyOpen && canReply && (
          <CommentForm
            storyId={storyId}
            parentId={comment.id}
            onCommentCreated={handleReplyCreated}
            className="mt-4 pl-10"
          />
        )}

        {!replyOpen && canReply && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 text-ink-muted hover:text-accent-ink"
            onClick={() => setReplyOpen(true)}
          >
            <Icon name="arrow" size="sm" className="mr-1 rotate-180" />
            {social.commentReplyButton}
          </Button>
        )}

        {repliesOpen && (
          <>
            {repliesLoading && (
              <p className="text-xs text-ink-muted text-center py-2">
                {social.commentLoadingReplies ?? "جاري تحميل الردود…"}
              </p>
            )}
            <CommentThread
              comments={effectiveReplies}
              storyId={storyId}
              depth={depth + 1}
              onCommentDeleted={onCommentDeleted}
            />
          </>
        )}
      </Card>
    </article>
  );
}
