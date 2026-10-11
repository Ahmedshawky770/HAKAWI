/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { api } from "@/lib/api";

import StoryReactionsPage from "@/app/(app)/stories/[id]/reactions/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

  it("renders the story reactions heading", async () => {
    render(await StoryReactionsPage({ params: Promise.resolve({ id: "story-1" }) }));
    expect(screen.getByRole("heading", { name: "التفاعلات" })).toBeInTheDocument();
  });

  it("loads reactions on mount", async () => {
    render(await StoryReactionsPage({ params: Promise.resolve({ id: "story-1" }) }));
    expect(mockedApi.getReactions).toHaveBeenCalledWith("story-1", { page: 1, limit: 20 });
  });

  it("renders the back link to the story", async () => {
    render(await StoryReactionsPage({ params: Promise.resolve({ id: "story-1" }) }));
    expect(screen.getByRole("link", { name: "العودة للقصة" })).toHaveAttribute(
      "href",
      "/stories/story-1",
    );
  });

  it("displays the reaction type labels", async () => {
    render(await StoryReactionsPage({ params: Promise.resolve({ id: "story-1" }) }));
    expect(screen.getByText("أحببتها")).toBeInTheDocument();
    expect(screen.getByText("أعجبني")).toBeInTheDocument();
  });
});
