/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { STORY, STORY_RECORD } from "@/test-utils/fixtures";
import StoryDetailPage from "@/app/(app)/stories/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const paramsMock = vi.fn<() => { id: string }>();

vi.mock("next/navigation", () => ({
  useParams: () => paramsMock(),
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  paramsMock.mockReturnValue({ id: "story-1" });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function lastRequestUrl(): string {
  const [input] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? [];
  return String(input);
}

describe("story detail page", () => {
  it("announces a loading state while the story is fetched", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    render(<StoryDetailPage />);

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("requests the story of the route parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { name: STORY.title });
    expect(lastRequestUrl()).toContain("/stories/story-1");
  });

  it("renders the story title as the page heading", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: STORY.title })).toBeInTheDocument();
  });

  it("renders the story body as markup", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByText("نص القصة")).toBeInTheDocument();
  });

  it("renders the view count, the reaction count and the category", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByText("1,500 مشاهدة")).toBeInTheDocument();
    expect(screen.getByText("42 تفاعل")).toBeInTheDocument();
    expect(screen.getByText("fiction")).toBeInTheDocument();
  });

  it("links to the author profile", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: `بواسطة ${STORY.author.name}` })).toHaveAttribute(
      "href",
      `/users/${STORY.author.id}`,
    );
  });

  it("offers a link back to the story index", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: /العودة للقصص/ })).toHaveAttribute("href", "/stories");
  });

  it("omits the byline when the author name is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, author: { id: "user-1", name: "" } }));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
  });

  it("keeps the author profile reachable when the author name is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, author: { id: "user-9", name: null } }));

    render(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: "ملف الكاتب" })).toHaveAttribute("href", "/users/user-9");
  });

  it("shows the uncategorized affordance when the category is null", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, category: null }));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByText("بدون تصنيف")).toBeInTheDocument();
    expect(screen.queryByText("fiction")).not.toBeInTheDocument();
  });

  it("normalizes a record that carries no author name into a page without a byline", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY_RECORD));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY_RECORD.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ملف الكاتب" })).toHaveAttribute("href", `/users/${STORY_RECORD.authorId}`);
  });

  it("normalizes a record that carries an author name into a byline", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY_RECORD, authorName: "أحمد محمد" }));

    render(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: "بواسطة أحمد محمد" })).toHaveAttribute(
      "href",
      `/users/${STORY_RECORD.authorId}`,
    );
  });

  it("shows the uncategorized affordance for a record without a category", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY_RECORD, categoryId: null }));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY_RECORD.title });
    expect(screen.getByText("بدون تصنيف")).toBeInTheDocument();
  });

  it("renders an empty body note for a story without content", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, content: null }));

    render(<StoryDetailPage />);

    expect(await screen.findByText("لا يوجد محتوى")).toBeInTheDocument();
  });

  it("normalizes a stored story record into the wire shape the page renders", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY_RECORD));

    render(<StoryDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: STORY_RECORD.title })).toBeInTheDocument();
    expect(screen.getByText("1,500 مشاهدة")).toBeInTheDocument();
    expect(screen.getByText("42 تفاعل")).toBeInTheDocument();
    expect(screen.getByText("fiction")).toBeInTheDocument();
  });

  it("renders the not found message of the server", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Story not found" }, 404));

    render(<StoryDetailPage />);

    expect(await screen.findByText("Story not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the unauthorized message of an expired session", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401));

    render(<StoryDetailPage />);

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("renders the schema rejection of a malformed story payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "story-1", title: "ناقص" }));

    render(<StoryDetailPage />);

    expect(await screen.findByText(/^Invalid server response:/)).toBeInTheDocument();
  });

  it("renders the schema rejection of a payload whose counters are strings", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, views: "1500" }));

    render(<StoryDetailPage />);

    expect(await screen.findByText(/^Invalid server response:/)).toBeInTheDocument();
  });

  it("renders the failure of an unreachable server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<StoryDetailPage />);

    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
  });

  it("stops announcing the loading state once the story is rendered", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("fetches once per rendered story", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    render(<StoryDetailPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
