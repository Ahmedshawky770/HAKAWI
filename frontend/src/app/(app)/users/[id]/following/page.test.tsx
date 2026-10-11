/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { api } from "@/lib/api";

import UsersFollowingPage from "@/app/(app)/users/[id]/following/page";

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
    getFollowing: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockFollowing = {
  following: [
    { id: "user-3", name: "محمد علي", username: "mohammed", avatar: null, followerId: "user-1", followingId: "user-3", createdAt: new Date().toISOString() },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

describe("Users following page", () => {
  beforeEach(() => {
    mockedApi.getFollowing.mockResolvedValue(mockFollowing);
  });

  it("renders the page title", async () => {
    render(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByRole("heading", { name: "المتابَعون" })).toBeInTheDocument();
  });

  it("loads following on mount", async () => {
    render(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(mockedApi.getFollowing).toHaveBeenCalledWith("user-1", { page: 1, limit: 20 });
  });

  it("renders the following rows", async () => {
    render(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByText("متابع")).toBeInTheDocument();
    const joined = new Date(mockFollowing.following[0].createdAt).toLocaleDateString("ar-EG");
    expect(screen.getByText(joined)).toBeInTheDocument();
  });

  it("falls back to the empty state when the request fails", async () => {
    mockedApi.getFollowing.mockRejectedValueOnce(new Error("request failed"));
    render(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByText("لا يوجد متابَعون بعد.")).toBeInTheDocument();
  });
});
