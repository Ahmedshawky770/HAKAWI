"use client";

import React from "react";

import { CommentItem } from "@/components/social/CommentItem";
import type { Comment } from "@/types/api";

interface CommentThreadProps {
  comments: Comment[];
  storyId: string;
  depth?: number;
  onCommentDeleted?: (commentId: string) => void;
  className?: string;
}

export function CommentThread({
  comments,
  storyId,
  depth = 0,
  onCommentDeleted,
  className = "",
}: CommentThreadProps) {
  if (comments.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          storyId={storyId}
          depth={depth}
          onCommentDeleted={onCommentDeleted}
        />
      ))}
    </div>
  );
}
