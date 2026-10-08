/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";


vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));
import { api } from "@/lib/api";
import { followersResponseSchema } from "@/lib/schemas";

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

  it("renders the page title", () => {
    render(<UsersFollowingPage params={Promise.resolve({ id: "user-1" })} />);
    expect(screen.getByRole("heading", { name: "المتابَعون" })).toBeInTheDocument();
  });

  it("loads following on mount", async () => {
    render(<UsersFollowingPage params={Promise.resolve({ id: "user-1" })} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.getFollowing).toHaveBeenCalledWith("user-1");
  });

  it("shows loading state", () => {
    render(<UsersFollowingPage params={Promise.resolve({ id: "user-1" })} />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("displays following list", () => {
    render(<UsersFollowingPage params={Promise.resolve({ id: "user-1" })} />);
    expect(screen.getByText("محمد علي")).toBeInTheDocument();
  });
});