/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { STORY, STORY_RECORD } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import AuthenticatedHomePage from "@/app/(app)/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function listResponse(stories: unknown[]): Response {
  return jsonResponse({ stories, total: stories.length, page: 1, limit: 20 });
}

// The empty state's title comes from the dictionary, and this suite asserts the
// dictionary rather than a retyped copy of it: the dashboard and the stories
// list render the SAME sentence, and the period is the difference between one
// string in two places and one string in one place.
const NO_STORIES_TITLE = stringsFor(DEFAULT_LOCALE).shell.noStories;

// A failure is CLASSIFIED before it reaches the reader, so the sentence the
// reader sees is the dictionary's — never the server's own wording.
const UNAUTHORIZED_MESSAGE = stringsFor(DEFAULT_LOCALE).errors.sessionExpired;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("authenticated home page", () => {
  it("announces a loading state while the stories are fetched", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<AuthenticatedHomePage />);

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("renders the dashboard heading as the page title", async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("لوحة التحكم");
  });

  it("renders zero totals when there is no story", async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByText("إجمالي القصص")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  it("names the author of a story whose name is known", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY]));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByText("بواسطة أحمد محمد")).toBeInTheDocument();
  });

  it("omits the byline entirely when the author name is missing", async () => {
    fetchMock.mockResolvedValue(listResponse([{ ...STORY, author: { id: "user-1", name: "" } }]));

    renderWithProviders(<AuthenticatedHomePage />);

    await screen.findByRole("heading", { level: 3, name: STORY.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
  });

  it("shows the uncategorized affordance when the category is null", async () => {
    fetchMock.mockResolvedValue(listResponse([{ ...STORY, category: null }]));

    renderWithProviders(<AuthenticatedHomePage />);

    await screen.findByRole("heading", { level: 3, name: STORY.title });
    expect(screen.getByText("بدون تصنيف")).toBeInTheDocument();
  });

  it("never renders a dangling byline for a raw record payload", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY_RECORD]));

    renderWithProviders(<AuthenticatedHomePage />);

    await screen.findByRole("heading", { level: 3, name: STORY_RECORD.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("renders the failure of the story list", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByText(UNAUTHORIZED_MESSAGE)).toBeInTheDocument();
  });

  it("links every story to its detail route", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY]));

    renderWithProviders(<AuthenticatedHomePage />);

    const link = await screen.findByRole("link", { name: new RegExp(STORY.title) });
    expect(link).toHaveAttribute("href", `/stories/${STORY.id}`);
  });

  it("fills the loading state with shaped story placeholders, not a bare spinner", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    const { container } = renderWithProviders(<AuthenticatedHomePage />);

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
    // Every placeholder is a shimmer block; a spinner would leave this empty.
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("keeps the page title while the list is still loading", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<AuthenticatedHomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("لوحة التحكم");
  });

  it("offers the action that fills an empty dashboard", async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByText(NO_STORIES_TITLE)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "اكتب قصة" })[0]).toHaveAttribute("href", "/stories/create");
  });

  it("announces a failed list in an alert region and retries it", async () => {
    const user = userEvent.setup({ delay: null });
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(UNAUTHORIZED_MESSAGE);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();

    fetchMock.mockResolvedValue(listResponse([STORY]));
    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 3, name: STORY.title })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a single level one heading on the dashboard", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY]));

    renderWithProviders(<AuthenticatedHomePage />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("لوحة التحكم");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
