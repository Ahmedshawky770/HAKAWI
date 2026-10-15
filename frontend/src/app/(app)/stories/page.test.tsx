/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { api } from "@/lib/api";
import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import StoriesPage from "./page";

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
    listStories: vi.fn(),
    getStory: vi.fn(),
    createComment: vi.fn(),
    claimLibraryItem: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

// Read from the dictionary, not written as literals: it is the single source of
// truth for this copy, so a literal here would silently drift from the page the
// moment the string changes in either locale.
const CATEGORY_LABEL = stringsFor(DEFAULT_LOCALE).story.storiesCategoryLabel;
const NO_STORIES_TITLE = stringsFor(DEFAULT_LOCALE).shell.noStories;

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
    renderWithProviders(<StoriesPage />);
    expect(screen.getByRole("heading", { name: "القصص" })).toBeInTheDocument();
  });

  it("renders the category filter selector", () => {
    renderWithProviders(<StoriesPage />);
    expect(screen.getByLabelText(CATEGORY_LABEL)).toBeInTheDocument();
  });

  it("calls listStories on mount", async () => {
    renderWithProviders(<StoriesPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.listStories).toHaveBeenCalled();
  });

  it("handles loading state", () => {
    mockedApi.listStories.mockResolvedValue({ stories: [], total: 0, page: 1, limit: 20 });
    renderWithProviders(<StoriesPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("handles error state", async () => {
    mockedApi.listStories.mockRejectedValue(new Error("Failed to load stories"));
    renderWithProviders(<StoriesPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load stories");
  });

  it("handles empty stories list", async () => {
    renderWithProviders(<StoriesPage />);
    expect(await screen.findByText(NO_STORIES_TITLE)).toBeInTheDocument();
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
    renderWithProviders(<StoriesPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("قصة اختبار")).toBeInTheDocument();
  });
});