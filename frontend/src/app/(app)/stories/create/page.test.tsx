/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { createDeferred } from "@/test-utils/support";
import StoryCreatePage from "@/app/(app)/stories/create/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    createStory: vi.fn(),
    listStories: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockStory = {
  id: "story-1",
  authorId: "user-1",
  authorName: "أحمد محمد",
  title: "قصة جديدة",
  slug: "new-story",
  excerpt: null,
  content: "محتوى القصة",
  coverImage: null,
  status: "published",
  categoryId: "cat-1",
  viewCount: 0,
  likeCount: 0,
  commentCount: 0,
  readingTime: 3,
  publishedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Story create page", () => {
  beforeEach(() => {
    mockedApi.createStory.mockResolvedValue(mockStory);
  });

  it("renders the story create heading", () => {
    render(<StoryCreatePage />);
    expect(screen.getByRole("heading", { name: "إنشاء قصة" })).toBeInTheDocument();
  });

  it("shows loading state", async () => {
    const deferred = createDeferred<typeof mockStory>();
    mockedApi.createStory.mockReturnValue(deferred.promise);
    const user = userEvent.setup({ delay: null });
    render(<StoryCreatePage />);
    await user.type(screen.getByLabelText("العنوان"), "قصة جديدة");
    await user.type(screen.getByLabelText("المحتوى"), "محتوى القصة");
    await user.click(screen.getByRole("button", { name: "إنشاء القصة" }));
    expect(screen.getByRole("button", { name: "إنشاء القصة" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    await act(async () => {
      deferred.resolve(mockStory);
    });
  });

  it("handles form submission", async () => {
    const user = userEvent.setup({ delay: null });
    render(<StoryCreatePage />);
    await user.type(screen.getByLabelText("العنوان"), "قصة جديدة");
    await user.type(screen.getByLabelText("المحتوى"), "محتوى القصة");
    await user.click(screen.getByRole("button", { name: "إنشاء القصة" }));
    await waitFor(() => {
      expect(mockedApi.createStory).toHaveBeenCalledWith({
        title: "قصة جديدة",
        content: "محتوى القصة",
        category: "fiction",
        tags: [],
      });
    });
  });
});
