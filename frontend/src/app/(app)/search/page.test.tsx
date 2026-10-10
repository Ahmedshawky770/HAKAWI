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
import { searchResponseSchema } from "@/lib/schemas";

import SearchPage from "@/app/(app)/search/page";

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
    search: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockSearchResults = {
  results: [
    {
      id: "story-1",
      title: "قصة البحث",
      author: { id: "user-1", name: "أحمد محمد" },
      category: "fiction",
      slug: "story-1",
      excerpt: "مقتطف من القصة",
      status: "published",
      tags: [],
      coverImage: "https://example.com/cover.jpg",
      views: 0,
      reactions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  total: 1,
  query: "اختبار",
  took: 42,
  page: 1,
  limit: 20,
};

describe("Search page", () => {
  beforeEach(() => {
    mockedApi.search.mockResolvedValue(mockSearchResults);
  });

  it("renders the page title", () => {
    render(<SearchPage />);
    expect(screen.getByRole("heading", { name: "البحث" })).toBeInTheDocument();
  });

  it("calls search on mount with default query", async () => {
    render(<SearchPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.search).toHaveBeenCalledWith({
      query: expect.any(String),
      category: undefined,
      tag: undefined,
      page: 1,
      limit: 20,
    });
  });

  it("handles loading state", () => {
    render(<SearchPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("displays search results", async () => {
    render(<SearchPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("قصة البحث")).toBeInTheDocument();
  });
});