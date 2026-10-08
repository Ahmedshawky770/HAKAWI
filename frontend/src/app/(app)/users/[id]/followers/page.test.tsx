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

  it("renders the page title", () => {
    render(<UsersFollowersPage params={Promise.resolve({ id: "user-1" })} />);
    expect(screen.getByRole("heading", { name: "المتابعون" })).toBeInTheDocument();
  });

  it("loads followers on mount", async () => {
    render(<UsersFollowersPage params={Promise.resolve({ id: "user-1" })} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.getFollowers).toHaveBeenCalledWith("user-1");
  });

  it("shows loading state", () => {
    render(<UsersFollowersPage params={Promise.resolve({ id: "user-1" })} />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("displays followers list", () => {
    render(<UsersFollowersPage params={Promise.resolve({ id: "user-1" })} />);
    expect(screen.getByText("علي محمد")).toBeInTheDocument();
  });
});