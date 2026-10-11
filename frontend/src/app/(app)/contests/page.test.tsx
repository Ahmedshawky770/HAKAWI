/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { api } from "@/lib/api";
import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";

import ContestsPage from "@/app/(app)/contests/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listContests: vi.fn(),
    getContest: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const contestDefaults = {
  id: "contest-1",
  title: "مسابقة القصص القصيرة",
  description: "أفضل قصة في الشهر",
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  submissionDeadline: new Date().toISOString(),
  categoryId: "cat-1",
  status: "active",
  createdBy: "user-1",
  winnerId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Contests list page", () => {
  beforeEach(() => {
    mockedApi.listContests.mockResolvedValue({
      contests: [contestDefaults],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("renders the page title", async () => {
    renderWithProviders(<ContestsPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "المسابقات" })).toBeInTheDocument();
    });
  });

  it("calls listContests on mount", async () => {
    renderWithProviders(<ContestsPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.listContests).toHaveBeenCalled();
  });

  it("handles loading state", () => {
    renderWithProviders(<ContestsPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("displays contests when available", async () => {
    renderWithProviders(<ContestsPage />);
    expect(await screen.findByText("مسابقة القصص القصيرة")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /مسابقة القصص القصيرة/ })).toHaveAttribute(
      "href",
      "/contests/contest-1",
    );
  });
});