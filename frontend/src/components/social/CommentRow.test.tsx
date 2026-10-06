import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { CommentListEmpty, CommentListSkeleton, CommentRow } from "@/components/social/CommentRow";
import type { Comment } from "@/types/api";

const sampleComment: Comment = {
  id: "comment-1",
  storyId: "story-1",
  authorId: "user-1",
  parentId: null,
  content: "هذا تعليق تجريبي",
  repliesCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  authorName: "كاتب تجريبي",
};

describe("CommentRow", () => {
  it("renders the comment author and content", () => {
    render(<CommentRow comment={sampleComment} />);

    expect(screen.getByText("كاتب تجريبي")).toBeDefined();
    expect(screen.getByText("هذا تعليق تجريبي")).toBeDefined();
  });
});

describe("CommentListSkeleton", () => {
  it("renders the requested number of skeletons", () => {
    render(<CommentListSkeleton count={2} />);

    expect(screen.getByLabelText("جارٍ التحميل…")).toBeDefined();
  });
});

describe("CommentListEmpty", () => {
  it("renders the empty state", () => {
    render(<CommentListEmpty />);

    expect(screen.getByText("لا توجد تعليقات بعد. كن أول من يعلق!")).toBeDefined();
  });
});
