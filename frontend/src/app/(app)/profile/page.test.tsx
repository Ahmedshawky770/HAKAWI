/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { api, getStoredUser } from "@/lib/api";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { AUTH_USER } from "@/test-utils/fixtures";
import ProfilePage from "@/app/(app)/profile/page";

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
    getUser: vi.fn(),
    getUserStats: vi.fn(),
  },
  getStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedGetStoredUser = vi.mocked(getStoredUser);

const mockUser = {
  id: "user-1",
  name: "أحمد محمد",
  username: "ahmed",
  bio: "كاتب قصص",
  avatar: "https://example.com/avatar.jpg",
  accountType: "writer" as const,
  isVerified: true,
  createdAt: new Date().toISOString(),
};

const mockStats = {
  storiesCount: 5,
  totalViews: 120,
  totalReactions: 30,
  followersCount: 10,
  followingCount: 3,
};

describe("Profile page", () => {
  beforeEach(() => {
    mockedGetStoredUser.mockReturnValue(AUTH_USER);
    mockedApi.getUser.mockResolvedValue(mockUser);
    mockedApi.getUserStats.mockResolvedValue(mockStats);
  });

  it("renders the user name", async () => {
    render(<ProfilePage />);
    expect(await screen.findByRole("heading", { name: "أحمد محمد" })).toBeInTheDocument();
  });

  it("renders the user bio", async () => {
    render(<ProfilePage />);
    expect(await screen.findByText("كاتب قصص")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<ProfilePage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });
});