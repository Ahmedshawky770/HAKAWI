/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { STORY, STORY_RECORD } from "@/test-utils/fixtures";
import AuthenticatedHomePage from "@/app/(app)/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function listResponse(stories: unknown[]): Response {
  return jsonResponse({ stories, total: stories.length, page: 1, limit: 20 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("authenticated home page", () => {
  it("announces a loading state while the stories are fetched", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    render(<AuthenticatedHomePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("renders the dashboard heading as the page title", async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    render(<AuthenticatedHomePage />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("لوحة التحكم");
  });

  it("renders zero totals when there is no story", async () => {
    fetchMock.mockResolvedValue(listResponse([]));

    render(<AuthenticatedHomePage />);

    expect(await screen.findByText("إجمالي القصص")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  it("names the author of a story whose name is known", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY]));

    render(<AuthenticatedHomePage />);

    expect(await screen.findByText("بواسطة أحمد محمد")).toBeInTheDocument();
  });

  it("omits the byline entirely when the author name is missing", async () => {
    fetchMock.mockResolvedValue(listResponse([{ ...STORY, author: { id: "user-1", name: "" } }]));

    render(<AuthenticatedHomePage />);

    await screen.findByRole("heading", { level: 3, name: STORY.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
  });

  it("shows the uncategorized affordance when the category is null", async () => {
    fetchMock.mockResolvedValue(listResponse([{ ...STORY, category: null }]));

    render(<AuthenticatedHomePage />);

    await screen.findByRole("heading", { level: 3, name: STORY.title });
    expect(screen.getByText("بدون تصنيف")).toBeInTheDocument();
  });

  it("never renders a dangling byline for a raw record payload", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY_RECORD]));

    render(<AuthenticatedHomePage />);

    await screen.findByRole("heading", { level: 3, name: STORY_RECORD.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("renders the failure of the story list", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401));

    render(<AuthenticatedHomePage />);

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("links every story to its detail route", async () => {
    fetchMock.mockResolvedValue(listResponse([STORY]));

    render(<AuthenticatedHomePage />);

    const link = await screen.findByRole("link", { name: new RegExp(STORY.title) });
    expect(link).toHaveAttribute("href", `/stories/${STORY.id}`);
  });
});
