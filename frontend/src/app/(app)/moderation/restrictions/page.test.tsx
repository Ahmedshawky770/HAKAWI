/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { api, getStoredUser } from "@/lib/api";
import { AUTH_USER } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
import UserRestrictionsPage from "@/app/(app)/moderation/restrictions/page";

vi.mock("@/lib/api", () => ({
  api: {
    getUserRestrictions: vi.fn(),
  },
  getStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedGetStoredUser = vi.mocked(getStoredUser);

describe("restrictions page", () => {
  beforeEach(() => {
    mockedGetStoredUser.mockReturnValue(AUTH_USER);
    mockedApi.getUserRestrictions.mockResolvedValue({
      restrictions: [
        {
          id: "restriction-1",
          userId: AUTH_USER.id,
          action: "warn",
          reason: "مخالفة بسيطة",
          durationMinutes: 60,
          expiresAt: "2026-02-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("names the action of the restriction in the reader's language", async () => {
    renderWithProviders(<UserRestrictionsPage />);

    expect(await screen.findByText("الإجراء: تحذير")).toBeInTheDocument();
    expect(screen.getByText("السبب: مخالفة بسيطة")).toBeInTheDocument();
  });

  it("says when there is no restriction on the account", async () => {
    mockedApi.getUserRestrictions.mockResolvedValue({ restrictions: [] });

    renderWithProviders(<UserRestrictionsPage />);

    expect(await screen.findByText("لا توجد قيود مفروضة على حسابك.")).toBeInTheDocument();
  });

  it("asks the server once for the list", async () => {
    renderWithProviders(<UserRestrictionsPage />);

    expect(await screen.findByText("الإجراء: تحذير")).toBeInTheDocument();
    expect(mockedApi.getUserRestrictions).toHaveBeenCalledTimes(1);
    expect(mockedApi.getUserRestrictions).toHaveBeenCalledWith(AUTH_USER.id, { includeExpired: true });
  });

  it("reports the failure of the list with a retry", async () => {
    mockedApi.getUserRestrictions.mockRejectedValue(new Error("restrictions are down"));

    renderWithProviders(<UserRestrictionsPage />);

    expect(await screen.findByText("فشل تحميل القيود")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
  });
});
