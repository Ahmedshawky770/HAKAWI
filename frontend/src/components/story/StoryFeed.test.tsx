/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StoryFeed } from "@/components/story/StoryFeed";
import { flattenStories, nextPageFrom, STORY_FEED_PAGE_SIZE } from "@/lib/queries";
import { jsonResponse } from "@/test-utils/support";
import { renderWithProviders } from "@/test-utils/render";
import { STORY, STORY_RECORD } from "@/test-utils/fixtures";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function storyPage(stories: unknown[], total: number, page = 1) {
  return jsonResponse({ stories, total, page, limit: STORY_FEED_PAGE_SIZE });
}

function fullStory(id: string, title: string) {
  return { ...STORY, id, title };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("nextPageFrom", () => {
  it("asks for the page after the one that just arrived", () => {
    expect(nextPageFrom({ page: 1, limit: 20, total: 45 })).toBe(2);
  });

  it("stops when the page just consumed everything", () => {
    expect(nextPageFrom({ page: 3, limit: 20, total: 45 })).toBeUndefined();
  });

  it("does not invent an empty page when the total divides evenly", () => {
    // `items.length === limit` would have asked for page 4 here and shown a
    // spinner with nothing behind it.
    expect(nextPageFrom({ page: 2, limit: 20, total: 40 })).toBeUndefined();
  });

  it("reports nothing to load for an empty list", () => {
    expect(nextPageFrom({ page: 1, limit: 20, total: 0 })).toBeUndefined();
  });

  it("trusts the total rather than the length of the page the API returned", () => {
    expect(nextPageFrom({ page: 1, limit: 10, total: 100 })).toBe(2);
  });
});

describe("flattenStories", () => {
  it("flattens every page in order", () => {
    const pages = {
      pages: [
        { stories: [fullStory("a", "أ")], total: 2, page: 1, limit: 20 },
        { stories: [fullStory("b", "ب")], total: 2, page: 2, limit: 20 },
      ],
    };
    expect(flattenStories(pages).map((story) => story.id)).toEqual(["a", "b"]);
  });

  it("never renders the same story twice, even if a page repeats it", () => {
    const pages = {
      pages: [
        { stories: [fullStory("a", "أ")], total: 1, page: 1, limit: 20 },
        { stories: [fullStory("a", "أ")], total: 1, page: 2, limit: 20 },
      ],
    };
    expect(flattenStories(pages)).toHaveLength(1);
  });

  it("returns nothing before the first page lands", () => {
    expect(flattenStories(undefined)).toEqual([]);
  });
});

describe("StoryFeed", () => {
  it("shows skeletons while the first page is in flight", () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const { container } = renderWithProviders(<StoryFeed />);

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ تحميل القصص");
    // Skeletons are placeholders, not content: never announced, never focusable.
    const skeletons = container.querySelectorAll(".hk-skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    for (const skeleton of skeletons) {
      expect(skeleton.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("announces the failure and offers a retry, rather than an empty feed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401));

    renderWithProviders(<StoryFeed />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unauthorized");
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
  });

  it("says so when there is genuinely nothing to read", async () => {
    fetchMock.mockResolvedValue(storyPage([], 0));

    renderWithProviders(<StoryFeed />);

    expect(await screen.findByText(/لا توجد قصص بعد/)).toBeInTheDocument();
  });

  it("links every card to its detail route", async () => {
    fetchMock.mockResolvedValue(storyPage([STORY], 1));

    renderWithProviders(<StoryFeed />);

    const link = await screen.findByRole("link", { name: new RegExp(STORY.title) });
    expect(link).toHaveAttribute("href", `/stories/${STORY.id}`);
  });

  it("keeps a real control to load more, because infinite scroll alone is unusable with a keyboard", async () => {
    fetchMock.mockResolvedValue(storyPage([STORY], 40));

    renderWithProviders(<StoryFeed />);

    expect(await screen.findByRole("button", { name: "تحميل المزيد من القصص" })).toBeInTheDocument();
  });

  it("drops that control once everything is loaded", async () => {
    fetchMock.mockResolvedValue(storyPage([STORY], 1));

    renderWithProviders(<StoryFeed />);

    await screen.findByRole("link", { name: new RegExp(STORY.title) });
    await waitFor(() => expect(screen.queryByRole("button", { name: "تحميل المزيد من القصص" })).toBeNull());
  });

  it("appends the next page without clearing the first", async () => {
    fetchMock.mockImplementation((input: string) => {
      // Total 25 with a page size of 20: exactly one more page exists.
      const page = new URL(String(input), "http://localhost").searchParams.get("page");
      return Promise.resolve(
        page === "2" ? storyPage([fullStory("story-2", "حكاية ثانية")], 25, 2) : storyPage([STORY], 25),
      );
    });

    const user = userEvent.setup();
    renderWithProviders(<StoryFeed />);

    await screen.findByRole("link", { name: new RegExp(STORY.title) });
    await user.click(screen.getByRole("button", { name: "تحميل المزيد من القصص" }));

    expect(await screen.findByRole("link", { name: new RegExp("حكاية ثانية") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(STORY.title) })).toBeInTheDocument();
  });

  it("announces that more is loading while the request is in flight", async () => {
    fetchMock.mockImplementation((input: string) => {
      const page = new URL(String(input), "http://localhost").searchParams.get("page");
      if (page === "2") return new Promise(() => undefined);
      return Promise.resolve(storyPage([STORY], 40));
    });

    const user = userEvent.setup();
    renderWithProviders(<StoryFeed />);

    await screen.findByRole("link", { name: new RegExp(STORY.title) });
    await user.click(screen.getByRole("button", { name: "تحميل المزيد من القصص" }));

    await waitFor(() => expect(screen.getByText("جارٍ تحميل المزيد…")).toBeInTheDocument());
  });

  it("renders the compact variant when a grid asks for one", async () => {
    fetchMock.mockResolvedValue(storyPage([STORY], 1));

    const { container } = renderWithProviders(<StoryFeed variant="compact" />);

    await screen.findByRole("link", { name: new RegExp(STORY.title) });
    expect(container.querySelector("img")).toBeNull();
  });

  it("survives a raw record payload without inventing a byline", async () => {
    fetchMock.mockResolvedValue(storyPage([STORY_RECORD], 1));

    renderWithProviders(<StoryFeed />);

    await screen.findByRole("heading", { level: 3, name: STORY_RECORD.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
  });
});