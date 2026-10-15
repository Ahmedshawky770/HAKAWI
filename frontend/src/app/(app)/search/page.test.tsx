/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import SearchPage from "@/app/(app)/search/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

// The query the URL carries, held rather than written into the factory so a
// test can put the page in front of a different URL — the idle state (no query
// at all) above all — without reworking the suite. Every existing test runs
// against the default, exactly as before.
let urlQuery = "q=اختبار";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(urlQuery),
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
    urlQuery = "q=اختبار";
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

  it("renders the results count grouped, the way the readout formats it", async () => {
    mockedApi.search.mockResolvedValue({
      ...mockSearchResults,
      total: 1234,
      results: Array.from({ length: 1234 }, (_, index) => ({
        ...mockSearchResults.results[0],
        id: `story-${index}`,
        title: `قصة ${index}`,
      })),
    });

    renderWithProviders(<SearchPage />);

    // The page counts the rows it renders, and the digits are the dictionary's
    // `resultsCount` — read the same way the component computes it, so the
    // grouping ("1,234") is the production formatting and not a retyped guess.
    const readout = stringsFor(DEFAULT_LOCALE).common.resultsCount(1234);
    expect(await screen.findByText(readout.count)).toHaveClass("hk-numeric");
    expect(screen.getByRole("status")).toHaveTextContent(`${readout.count} ${readout.label}`);
    expect(readout.count).toBe("1,234");
  });

  it("stays idle, and asks for nothing, while the URL carries no query", () => {
    urlQuery = "";

    renderWithProviders(<SearchPage />);

    const shell = stringsFor(DEFAULT_LOCALE).shell;
    expect(screen.getByText(shell.searchIdleDescription)).toBeInTheDocument();
    expect(mockedApi.search).not.toHaveBeenCalled();
  });

  it("searches the term a suggestion offers, and fills the field with it", async () => {
    const user = userEvent.setup();
    urlQuery = "q=رعب";
    mockedApi.search.mockResolvedValue({ ...mockSearchResults, results: [], total: 0 });

    renderWithProviders(<SearchPage />);

    const shell = stringsFor(DEFAULT_LOCALE).shell;
    // The empty state — and with it the suggestions — arrives once the search
    // has settled with nothing to show.
    await screen.findByText(stringsFor(DEFAULT_LOCALE).common.noResults);
    for (const term of shell.searchSuggestions) {
      expect(screen.getByRole("button", { name: term })).toBeInTheDocument();
    }

    // A suggestion distinct from the query the URL arrived with, so the call
    // that follows can only have come from the click.
    const picked = shell.searchSuggestions[1];
    await user.click(screen.getByRole("button", { name: picked }));

    expect(mockedApi.search).toHaveBeenLastCalledWith({ query: picked });
    expect(screen.getByLabelText(shell.searchLabel)).toHaveValue(picked);
  });

  it("surfaces a failed search and asks again when the reader retries", async () => {
    const user = userEvent.setup();
    urlQuery = "q=رعب";
    mockedApi.search.mockRejectedValueOnce(new Error("تعذّر الاتصال بالخادم"));

    renderWithProviders(<SearchPage />);

    const shell = stringsFor(DEFAULT_LOCALE).shell;
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذّر الاتصال بالخادم");
    expect(screen.getByRole("heading", { name: shell.searchFailed })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: stringsFor(DEFAULT_LOCALE).common.retry }));

    expect(mockedApi.search).toHaveBeenCalledTimes(2);
    expect(mockedApi.search).toHaveBeenLastCalledWith({ query: "رعب" });
  });
});
