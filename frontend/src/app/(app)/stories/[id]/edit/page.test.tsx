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

import StoryEditPage from "@/app/(app)/stories/[id]/edit/page";

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
    getStory: vi.fn(),
    updateStory: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockStory = {
  id: "story-1",
  title: "قصة للتحرير",
  author: { id: "user-1", name: "أحمد محمد" },
  category: "fiction",
  slug: "story-1",
  excerpt: "مقتطف من القصة",
  content: "محتوى القصة الكامل",
  coverImage: "https://example.com/cover.jpg",
  status: "published",
  tags: [],
  views: 0,
  reactions: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Story edit page", () => {
  beforeEach(() => {
    mockedApi.getStory.mockResolvedValue(mockStory);
  });

  it("renders the story edit heading", () => {
    render(<StoryEditPage />);
    expect(screen.getByRole("heading", { name: "تحرير القصة" })).toBeInTheDocument();
  });

  it("loads the story data on mount", async () => {
    render(<StoryEditPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.getStory).toHaveBeenCalledWith("story-1");
  });

  it("shows loading state", () => {
    mockedApi.getStory.mockResolvedValue({
      id: "story-1",
      title: "قصة للتحرير",
      author: { id: "user-1", name: "أحمد محمد" },
      category: "fiction",
      slug: "story-1",
      excerpt: "مقتطف من القصة",
      content: "محتوى القصة الكامل",
      coverImage: "https://example.com/cover.jpg",
      status: "published",
      tags: [],
      views: 0,
      reactions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    render(<StoryEditPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });
});