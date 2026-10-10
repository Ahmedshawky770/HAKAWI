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
import StoriesPage from "./page";

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
    listStories: vi.fn(),
    getStory: vi.fn(),
    createComment: vi.fn(),
    claimLibraryItem: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("Stories list page", () => {
  beforeEach(() => {
    mockedApi.listStories.mockResolvedValue({
      stories: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("renders the page header with title and description", () => {
    render(<StoriesPage />);
    expect(screen.getByRole("heading", { name: "القصص" })).toBeInTheDocument();
  });

  it("renders the category filter selector", () => {
    render(<StoriesPage />);
    expect(screen.getByLabelText("التصنيف")).toBeInTheDocument();
  });

  it("calls listStories on mount", async () => {
    render(<StoriesPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.listStories).toHaveBeenCalled();
  });

  it("handles loading state", () => {
    mockedApi.listStories.mockResolvedValue({ stories: [], total: 0, page: 1, limit: 20 });
    render(<StoriesPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("handles error state", () => {
    mockedApi.listStories.mockRejectedValue(new Error("Failed to load stories"));
    render(<StoriesPage />);
    expect(screen.getByText("فشل تحميل القصص")).toBeInTheDocument();
  });

  it("handles empty stories list", () => {
    render(<StoriesPage />);
    expect(screen.getByText("لا توجد قصص بعد")).toBeInTheDocument();
  });

  it("displays stories when available", async () => {
    mockedApi.listStories.mockResolvedValue({
      stories: [
        {
          id: "story-1",
          title: "قصة اختبار",
          author: { id: "user-1", name: "أحمد محمد" },
          category: "fiction",
          slug: "story-1",
          excerpt: "مقتطف من القصة",
          content: "محتوى القصة",
          coverImage: "https://example.com/cover.jpg",
          status: "published",
          tags: [],
          views: 150,
          reactions: 42,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    render(<StoriesPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("قصة اختبار")).toBeInTheDocument();
  });
});