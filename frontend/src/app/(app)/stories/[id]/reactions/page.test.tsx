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

import StoryReactionsPage from "@/app/(app)/stories/[id]/reactions/page";

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
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockReactions = {
  total: 8,
  page: 1,
  limit: 20,
  reactions: [
    { type: "love" as const, count: 5, id: "react-1", userId: "user-1", storyId: "story-1", createdAt: new Date().toISOString() },
    { type: "like" as const, count: 3, id: "react-2", userId: "user-2", storyId: "story-1", createdAt: new Date().toISOString() },
  ],
};

describe("Story reactions page", () => {
  beforeEach(() => {
    mockedApi.getReactions.mockResolvedValue(mockReactions);
  });

  it("renders the story reactions heading", () => {
    render(<StoryReactionsPage params={Promise.resolve({ id: "story-1" })} />);
    expect(screen.getByRole("heading", { name: "تفاعلات القصة" })).toBeInTheDocument();
  });

  it("loads reactions on mount", async () => {
    render(<StoryReactionsPage params={Promise.resolve({ id: "story-1" })} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.getReactions).toHaveBeenCalledWith("story-1");
  });

  it("shows loading state", () => {
    render(<StoryReactionsPage params={Promise.resolve({ id: "story-1" })} />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("displays reaction counts", () => {
    render(<StoryReactionsPage params={Promise.resolve({ id: "story-1" })} />);
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});