/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { api, getStoredUser } from "@/lib/api";
import { AUTH_USER } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
import BadgesPage from "@/app/(app)/badges/page";

vi.mock("@/lib/api", () => ({
  api: {
    listBadges: vi.fn(),
    listUserBadges: vi.fn(),
  },
  getStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedGetStoredUser = vi.mocked(getStoredUser);

const BADGE = {
  key: "first_story",
  name: "أول قصة",
  description: "نشرت قصتك الأولى.",
  icon: "📖",
  trigger: "publish_first_story",
  threshold: 1,
};

describe("badges page", () => {
  beforeEach(() => {
    mockedGetStoredUser.mockReturnValue(AUTH_USER);
    mockedApi.listBadges.mockResolvedValue({ badges: [BADGE] });
    mockedApi.listUserBadges.mockResolvedValue({
      badges: [
        {
          id: "awarded-1",
          badgeId: "badge-1",
          badgeKey: "first_story",
          name: BADGE.name,
          description: null,
          icon: null,
          awardedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
  });

  it("lists the catalogue", async () => {
    renderWithProviders(<BadgesPage />);

    expect(await screen.findByRole("heading", { name: BADGE.name })).toBeInTheDocument();
    expect(screen.getByText(BADGE.description)).toBeInTheDocument();
    expect(screen.getByText("الحد: 1 • publish_first_story")).toBeInTheDocument();
  });

  it("asks the server for the catalogue once", async () => {
    renderWithProviders(<BadgesPage />);

    expect(await screen.findByRole("heading", { name: BADGE.name })).toBeInTheDocument();
    expect(mockedApi.listBadges).toHaveBeenCalledTimes(1);
  });

  it("marks the badge the reader has earned", async () => {
    renderWithProviders(<BadgesPage />);

    expect(await screen.findByText("مكتسبة")).toBeInTheDocument();
  });

  it("says when the catalogue is empty", async () => {
    mockedApi.listBadges.mockResolvedValue({ badges: [] });

    renderWithProviders(<BadgesPage />);

    expect(await screen.findByText("لا توجد شارات بعد.")).toBeInTheDocument();
  });

  it("reports the failure of the catalogue with a retry", async () => {
    mockedApi.listBadges.mockRejectedValue(new Error("badges are down"));

    renderWithProviders(<BadgesPage />);

    expect(await screen.findByText("فشل تحميل الشارات")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
  });
});
