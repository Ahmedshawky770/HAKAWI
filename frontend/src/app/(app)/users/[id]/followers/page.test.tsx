/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { api } from "@/lib/api";
import { formatDate, intlLocale } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";

import { renderWithProviders } from "@/test-utils/render";
import UsersFollowersPage from "@/app/(app)/users/[id]/followers/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: {
    to: "/",
    className: "",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getFollowers: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockFollowers = {
  followers: [
    { id: "user-2", name: "علي محمد", username: "ali", avatar: null, followerId: "user-2", followingId: "user-1", createdAt: new Date().toISOString() },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

describe("Users followers page", () => {
  beforeEach(() => {
    mockedApi.getFollowers.mockResolvedValue(mockFollowers);
  });

  it("renders the page title", async () => {
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByRole("heading", { name: "المتابعون" })).toBeInTheDocument();
  });

  it("loads followers on mount", async () => {
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(mockedApi.getFollowers).toHaveBeenCalledWith("user-1", { page: 1, limit: 20 });
  });

  it("renders the follower rows", async () => {
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByText("متابع")).toBeInTheDocument();
    const joined = formatDate(mockFollowers.followers[0].createdAt, intlLocale(DEFAULT_LOCALE));
    expect(screen.getByText(joined)).toBeInTheDocument();
  });

  it("falls back to the empty state when the request fails", async () => {
    mockedApi.getFollowers.mockRejectedValueOnce(new Error("request failed"));
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByText("لا يوجد متابعون بعد.")).toBeInTheDocument();
  });
});
