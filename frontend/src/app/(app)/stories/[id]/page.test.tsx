/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test-utils/render";
import { stringsFor } from "@/lib/i18n";
import { storyCategoryLabel } from "@/lib/i18n/story";
import { DEFAULT_LOCALE } from "@/lib/preferences";

const { mockGetStory, mockDeleteStory, mockGetStoredUser } = vi.hoisted(() => ({
  mockGetStory: vi.fn(),
  mockDeleteStory: vi.fn(),
  mockGetStoredUser: vi.fn(() => ({ id: "user-1" })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getStory: mockGetStory,
    deleteStory: mockDeleteStory,
    getReactionCounts: vi.fn(),
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
  getStoredUser: mockGetStoredUser,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "story-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import StoryDetailPage from "./page";

const mockStory = {
  id: "story-1",
  title: "قصة مميزة",
  slug: "qasa-mumayiza",
  excerpt: "مقتطف",
  content: "<p>محتوى القصة التجريبي</p>",
  coverImage: null,
  status: "published",
  category: "fiction",
  tags: [],
  views: 1500,
  reactions: 42,
  commentCount: 3,
  author: { id: "user-1", name: "أحمد محمد" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// The banner title is dictionary copy; a literal here would drift from the page
// the moment the string changes in either locale.
const STORY_OPEN_FAILED = stringsFor(DEFAULT_LOCALE).story.storyOpenFailed;
// The category label is read through the same function the page reads it
// through, for the same reason: one table per locale, one reader.
const FICTION_LABEL = storyCategoryLabel("fiction", DEFAULT_LOCALE);

function renderPage() {
  return renderWithProviders(<StoryDetailPage />);
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("Story detail page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetStory.mockResolvedValue(mockStory);
    mockGetStoredUser.mockReturnValue({ id: "user-1" });
  });

  it("renders the story title", async () => {
    renderPage();
    expect(await screen.findByText("قصة مميزة")).toBeInTheDocument();
  });

  it("renders the story category", async () => {
    renderPage();
    expect(await screen.findByText(FICTION_LABEL)).toBeInTheDocument();
  });

  it("renders the author byline and avatar initial", async () => {
    renderPage();
    expect(await screen.findByText("بواسطة أحمد محمد")).toBeInTheDocument();
    expect(screen.getByText("أ")).toBeInTheDocument();
  });

  it("renders the story views and reactions", async () => {
    renderPage();
    expect(await screen.findByText("قصة مميزة")).toBeInTheDocument();

    // Read from the dictionary, in the shape the page renders them: the digits
    // inside the `.hk-numeric` isolate and the noun as sentence text. A single
    // literal here would not notice the two parts drifting apart again.
    const views = stringsFor("ar").story.views(mockStory.views);
    const reactions = stringsFor("ar").story.reactions(mockStory.reactions);
    expect(screen.getByText(views.count)).toBeInTheDocument();
    expect(screen.getByText(views.label)).toBeInTheDocument();
    expect(screen.getByText(reactions.count)).toBeInTheDocument();
    expect(screen.getByText(reactions.label)).toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    mockGetStory.mockResolvedValueOnce(null);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
    await settle();
  });

  it("handles error when story not found", async () => {
    mockGetStory.mockRejectedValueOnce(new Error("Story not found"));
    renderPage();
    expect(await screen.findByText(STORY_OPEN_FAILED)).toBeInTheDocument();
  });

  it("deletes the story when the owner confirms", async () => {
    renderPage();
    await screen.findByText("قصة مميزة");
    fireEvent.click(screen.getByRole("button", { name: "حذف القصة" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الحذف" }));
    await settle();
    expect(mockDeleteStory).toHaveBeenCalledWith("story-1");
  });

  it("shows empty state when story is not found", async () => {
    mockGetStory.mockResolvedValueOnce(null);
    renderPage();
    expect(await screen.findByText("القصة غير موجودة")).toBeInTheDocument();
  });

  it("renders reaction bar", async () => {
    renderPage();
    expect(await screen.findByRole("group", { name: "التفاعلات" })).toBeInTheDocument();
  });
});
