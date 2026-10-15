import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { CommentListEmpty, CommentRow } from "@/components/social/CommentRow";
import { renderWithProviders } from "@/test-utils/render";
import type { Comment } from "@/types/api";

const sampleComment: Comment = {
  id: "comment-1",
  storyId: "story-1",
  authorId: "user-1",
  parentId: null,
  content: "هذا تعليق تجريبي",
  replyCount: 0,
  likeCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  authorName: "كاتب تجريبي",
};

describe("CommentRow", () => {
  it("renders the comment author and content", () => {
    renderWithProviders(<CommentRow comment={sampleComment} />);

    expect(screen.getByText("كاتب تجريبي")).toBeDefined();
    expect(screen.getByText("هذا تعليق تجريبي")).toBeDefined();
  });
});

describe("CommentListEmpty", () => {
  it("renders the empty state", () => {
    renderWithProviders(<CommentListEmpty />);

    expect(screen.getByText("لا توجد تعليقات بعد. كن أول من يعلق!")).toBeDefined();
  });
});
