/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { CONTEST } from "@/test-utils/fixtures";
import ContestDetailPage from "@/app/(app)/contests/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "contest-1" }),
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

describe("contest detail page", () => {
  it("announces a loading state while the contest is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<ContestDetailPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("requests the contest of the route parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONTEST));

    renderWithProviders(<ContestDetailPage />);

    await screen.findByText(CONTEST.title);
    expect(lastCall()?.input).toContain("/contests/contest-1");
  });

  it("renders the title as the one level one heading", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONTEST));

    renderWithProviders(<ContestDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: CONTEST.title })).toBeInTheDocument();
  });

  it("renders a submission form", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONTEST));

    renderWithProviders(<ContestDetailPage />);

    expect(await screen.findByLabelText("معرّف القصة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرسال المشاركة" })).toBeInTheDocument();
  });

  it("offers a way back to the contests list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONTEST));

    renderWithProviders(<ContestDetailPage />);

    expect(await screen.findByRole("link", { name: /العودة إلى المسابقات/ })).toHaveAttribute("href", "/contests");
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Contest not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(CONTEST));

    renderWithProviders(<ContestDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Contest not found");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 1, name: CONTEST.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONTEST));

    const { container } = renderWithProviders(<ContestDetailPage />);
    await screen.findByText(CONTEST.title);

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|text-red-6/);
  });
});
