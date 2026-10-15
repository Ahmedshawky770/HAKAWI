/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";

import { api } from "@/lib/api";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import StoryEditPage from "@/app/(app)/stories/[id]/edit/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "story-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getStory: vi.fn(),
    updateStory: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockStory = {
  id: "story-1",
  authorId: "user-1",
  authorName: "أحمد محمد",
  title: "قصة قديمة",
  slug: "old-story",
  excerpt: null,
  content: "محتوى قديم",
  coverImage: null,
  status: "published",
  category: "fiction",
  categoryId: "cat-1",
  tags: [],
  views: 0,
  viewCount: 0,
  reactions: 0,
  likeCount: 0,
  commentCount: 0,
  readingTime: 3,
  publishedAt: null,
  deletedAt: null,
  author: { id: "user-1", name: "أحمد محمد" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("Story edit page", () => {
  beforeEach(() => {
    mockedApi.getStory.mockResolvedValue(mockStory);
    mockedApi.updateStory.mockResolvedValue(mockStory);
    mockedApi.deleteStory.mockResolvedValue(undefined);
  });

  it("renders the story edit heading", () => {
    renderWithProviders(<StoryEditPage />);
    expect(screen.getByRole("heading", { name: "تعديل القصة" })).toBeInTheDocument();
  });

  it("loads the story data on mount", async () => {
    renderWithProviders(<StoryEditPage />);
    await settle();
    expect(mockedApi.getStory).toHaveBeenCalledWith("story-1");
  });

  it("shows loading state", () => {
    renderWithProviders(<StoryEditPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });
});
