/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { api } from "@/lib/api";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import SearchPage from "@/app/(app)/search/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=اختبار"),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    search: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockSearchResults = {
  results: [
    {
      id: "story-1",
      title: "قصة البحث",
      slug: "story-1",
      excerpt: "مقتطف من القصة",
      status: "published",
      category: "fiction",
      tags: [],
      author: { id: "user-1", name: "أحمد محمد" },
      views: 10,
      reactions: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  query: "اختبار",
  took: 1,
};

describe("Search page", () => {
  beforeEach(() => {
    mockedApi.search.mockResolvedValue(mockSearchResults);
  });

  it("renders the page title", () => {
    renderWithProviders(<SearchPage />);
    expect(screen.getByRole("heading", { name: "البحث" })).toBeInTheDocument();
  });

  it("calls search on mount with the url query", async () => {
    renderWithProviders(<SearchPage />);
    await waitFor(() => {
      expect(mockedApi.search).toHaveBeenCalledWith({ query: "اختبار" });
    });
  });

  it("handles loading state", () => {
    renderWithProviders(<SearchPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جاري البحث…");
  });

  it("displays search results", async () => {
    renderWithProviders(<SearchPage />);
    expect(await screen.findByText("قصة البحث")).toBeInTheDocument();
  });
});
