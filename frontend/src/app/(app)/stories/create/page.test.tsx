/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";


vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));
import { api } from "@/lib/api";
import { storyRecordResponseSchema } from "@/lib/schemas";

import StoryCreatePage from "@/app/(app)/stories/create/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: {
    to: "/",
    className: "",
  },
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
  title: "قصة جديدة",
  author: { id: "user-1", name: "أحمد محمد" },
  category: "fiction",
  authorId: "user-1",
  authorName: "أحمد محمد",
  slug: "story-1",
  excerpt: "مقتطف من القصة",
  content: "محتوى القصة",
  coverImage: null,
  status: "draft",
  categoryId: "cat-1",
  viewCount: 0,
  likeCount: 0,
  commentCount: 0,
  readingTime: 5,
  deletedAt: null,
  tags: [],
  views: 0,
  reactions: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  publishedAt: null,
};

describe("Story create page", () => {
  beforeEach(() => {
    mockedApi.createStory.mockResolvedValue(mockStory);
  });

  it("renders the story create heading", () => {
    render(<StoryCreatePage />);
    expect(screen.getByRole("heading", { name: "إنشاء قصة جديدة" })).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<StoryCreatePage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("handles form submission", async () => {
    mockedApi.createStory.mockResolvedValue(mockStory);
    render(<StoryCreatePage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.createStory).toHaveBeenCalled();
  });
});