"use client";

import React, { useCallback, useState } from "react";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { useInvalidation } from "@/lib/queries";
import { useStoredUser } from "@/lib/use-stored-user";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/Input";
import type { Comment } from "@/types/api";

interface CommentFormProps {
  storyId: string;
  /** When set, the form is in edit mode for this comment. */
  editingComment?: Comment;
  /** When set, the created comment is a reply to this parent comment. */
  parentId?: string;
  onCommentCreated?: (comment: Comment) => void;
  onCommentUpdated?: (comment: Comment) => void;
  className?: string;
}

/** The generous upper bound for a single comment, matching the backend DTO. */
const COMMENT_MAX_LENGTH = 2000;

export function CommentForm({
  storyId,
  editingComment,
  onCommentCreated,
  onCommentUpdated,
  parentId,
  className = "",
}: CommentFormProps) {
  const { notify } = useToast();
  const { strings } = useLocale();
  const social = strings.social;
  const viewer = useStoredUser();
  const invalidation = useInvalidation();

  const [content, setContent] = useState(editingComment?.content ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!editingComment;
  const isOwnComment = editingComment ? editingComment.authorId === viewer?.id : false;

  const remaining = COMMENT_MAX_LENGTH - content.length;
  const atLimit = remaining <= 0;
  const nearLimit = remaining <= 50 && remaining > 0;

  const reset = useCallback(() => {
    setContent(editingComment?.content ?? "");
    setError(null);
    setSubmitting(false);
  }, [editingComment]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      const trimmed = content.trim();
      if (!trimmed || atLimit) return;

      setSubmitting(true);
      try {
        if (isEditMode && editingComment && isOwnComment) {
          const updated = await api.updateComment(storyId, editingComment.id, {
            content: trimmed,
          });
          onCommentUpdated?.(updated);
          notify(social.commentSentAnnouncement, "success");
          await invalidation.comments(storyId);
          reset();
        } else {
          const created = await api.createComment(storyId, { content: trimmed, parentId });
          onCommentCreated?.(created);
          notify(social.commentSentAnnouncement, "success");
          await invalidation.comments(storyId);
          setContent("");
        }
      } catch (err) {
        const message = classifyError(err);
        setError(strings.errors[message] ?? social.commentSendFailed);
        notify(strings.errors[message] ?? social.commentSendFailed, "error");
        if (!isEditMode) setContent("");
      } finally {
        setSubmitting(false);
      }
    },
    [content, atLimit, isEditMode, editingComment, isOwnComment, storyId, parentId, social, strings, onCommentCreated, onCommentUpdated, invalidation, notify, reset],
  );

  const handleCancel = useCallback(() => {
    if (isEditMode) {
      reset();
    } else {
      setContent("");
    }
    setError(null);
  }, [isEditMode, reset]);

  if (!viewer) {
    return (
      <div className={`rounded-xl border border-line-strong bg-surface/50 p-4 text-center ${className}`.trim()}>
        <Icon name="comment" className="mx-auto size-6 mb-2 text-ink-faint" />
        <p className="text-sm text-ink-muted">{strings.social.commentInputLabel}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {strings.social.commentSignInRequired}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-3 ${className}`.trim()}
    >
      <Textarea
        label={social.commentInputLabel}
        error={error ?? undefined}
        hint={
          atLimit
            ? social.commentLimitReached
            : nearLimit
              ? social.commentRemaining(remaining)
              : undefined
        }
        className={`font-arabic-body leading-7 resize-none ${atLimit || nearLimit ? "text-error-ink" : ""}`}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={isEditMode ? 4 : 3}
      />

      <div className="flex items-end justify-between gap-3">
        <span className={`text-xs ${atLimit ? "text-error-ink" : "text-ink-faint"}`}>
          {content.length} / {COMMENT_MAX_LENGTH}
        </span>

        <div className="flex items-center gap-2">
          {isEditMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={submitting}
            >
              {strings.story.cancelButton}
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={!content.trim() || atLimit || submitting}
          >
            {isEditMode ? strings.social.commentEditButton : social.commentSendButton}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function useCommentForm() {
  const [draft, setDraft] = useState("");
  return { draft, setDraft };
}
