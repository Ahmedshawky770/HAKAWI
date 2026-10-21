/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { api, getStoredUser } from "@/lib/api";
import { AUTH_USER, CONTEST } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
import PublisherDashboardPage from "@/app/(app)/contests/publisher/page";

vi.mock("@/lib/api", () => ({
  api: {
    getPublisherStats: vi.fn(),
    listContests: vi.fn(),
    getPublisherSubmissions: vi.fn(),
    getPublisherVotes: vi.fn(),
  },
  getStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedGetStoredUser = vi.mocked(getStoredUser);

const STATS = {
  totalContests: 4,
  activeContests: 1,
  completedContests: 3,
  totalSubmissions: 12,
  pendingSubmissions: 2,
  approvedSubmissions: 8,
  rejectedSubmissions: 2,
  totalVotes: 30,
  totalPrizes: 3,
};

describe("publisher dashboard", () => {
  beforeEach(() => {
    mockedGetStoredUser.mockReturnValue(AUTH_USER);
    mockedApi.getPublisherStats.mockResolvedValue(STATS);
    mockedApi.listContests.mockResolvedValue({
      contests: [CONTEST],
      total: 1,
      page: 1,
      limit: 20,
    });
    mockedApi.getPublisherSubmissions.mockResolvedValue({
      submissions: [
        {
          id: "submission-1",
          storyId: "story-1",
          authorId: "user-2",
          status: "pending",
          submittedAt: "2026-01-02T00:00:00.000Z",
          reviewedAt: null,
          reviewedBy: null,
          votes: 5,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    mockedApi.getPublisherVotes.mockResolvedValue({
      votes: [
        {
          id: "vote-1",
          submissionId: "submission-1",
          userId: "user-3",
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("shows the publisher's own numbers", async () => {
    renderWithProviders(<PublisherDashboardPage />);

    expect(await screen.findByText("إجمالي المسابقات")).toBeInTheDocument();
    expect(screen.getByText("إجمالي المسابقات").parentElement?.textContent).toContain("4");
  });

  it("reads the entries and the votes of the publisher's live contest", async () => {
    renderWithProviders(<PublisherDashboardPage />);

    await waitFor(() => {
      expect(mockedApi.getPublisherSubmissions).toHaveBeenCalledWith("contest-1", undefined);
    });
    expect(mockedApi.getPublisherVotes).toHaveBeenCalledWith("contest-1", undefined);
  });

  it("keeps the loaded panels on screen when one loader fails", async () => {
    mockedApi.getPublisherVotes.mockRejectedValue(new Error("votes are down"));

    renderWithProviders(<PublisherDashboardPage />);

    // The failure is reported at the top of the page, and the panels that did
    // load are still there.
    expect(await screen.findByText("فشل تحميل لوحة الناشر")).toBeInTheDocument();
    expect(screen.getByText("إجمالي المسابقات")).toBeInTheDocument();
  });

  it("lists the entries of the live contest under the entries tab", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderWithProviders(<PublisherDashboardPage />);

    await screen.findByText("إجمالي المسابقات");
    await user.click(screen.getByRole("button", { name: "المشاركات" }));

    expect(await screen.findByText("معرّف القصة: story-1")).toBeInTheDocument();
    expect(screen.getByText("الحالة: قيد المراجعة")).toBeInTheDocument();
  });
});
