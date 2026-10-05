/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { CONTEST } from "@/test-utils/fixtures";
import ContestsPage from "@/app/(app)/contests/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { input: string; init?: RequestInit } | undefined {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call ? { input: call[0], init: call[1] } : undefined;
}

describe("contests page", () => {
  it("announces a loading state while contests are in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<ContestsPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("requests the list of contests", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ contests: [CONTEST], total: 1, page: 1, limit: 20 }),
    );

    renderWithProviders(<ContestsPage />);

    await screen.findByText(CONTEST.title);
    expect(lastCall()?.input).toContain("/contests");
  });

  it("renders each contest in a card", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ contests: [CONTEST], total: 1, page: 1, limit: 20 }),
    );

    renderWithProviders(<ContestsPage />);

    expect(await screen.findByText(CONTEST.title)).toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Server error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ contests: [CONTEST], total: 1, page: 1, limit: 20 }));

    renderWithProviders(<ContestsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByText(CONTEST.title)).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ contests: [CONTEST], total: 1, page: 1, limit: 20 }),
    );

    const { container } = renderWithProviders(<ContestsPage />);
    await screen.findByText(CONTEST.title);

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|text-red-6/);
  });
});
