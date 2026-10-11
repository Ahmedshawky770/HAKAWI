/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { api } from "@/lib/api";

import { AnchorLink } from "@/test-utils/navigation-mock";
import PublicUserPage from "@/app/(app)/users/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "user-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getUser: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockUser = {
  id: "user-1",
  name: "أحمد محمد",
  username: "ahmed",
  email: "ahmed@example.com",
  avatar: "https://example.com/avatar.jpg",
  bio: "كاتب قصص",
  isVerified: true,
  followersCount: 120,
  followingCount: 45,
  storiesCount: 12,
  accountType: "writer" as const,
  createdAt: new Date().toISOString(),
};

describe("Public user page", () => {
  beforeEach(() => {
    mockedApi.getUser.mockResolvedValue(mockUser);
    mockedApi.logout.mockResolvedValue({ message: "تم تسجيل الخروج" });
  });

  it("renders the user name", async () => {
    render(<PublicUserPage />);
    expect(await screen.findByRole("heading", { name: "أحمد محمد" })).toBeInTheDocument();
  });

  it("renders the user username", async () => {
    render(<PublicUserPage />);
    expect(await screen.findByText("@ahmed")).toBeInTheDocument();
  });

  it("renders the user bio", async () => {
    render(<PublicUserPage />);
    expect(await screen.findByText("كاتب قصص")).toBeInTheDocument();
  });

  it("renders the user avatar", async () => {
    const { container } = render(<PublicUserPage />);
    await screen.findByRole("heading", { name: "أحمد محمد" });
    expect(container.querySelector("img")).toHaveAttribute("src", mockUser.avatar);
  });

  it("renders follow and following links", async () => {
    render(<PublicUserPage />);
    expect(await screen.findByRole("link", { name: "المتابعون" })).toHaveAttribute(
      "href",
      "/users/user-1/followers",
    );
    expect(screen.getByRole("link", { name: "المتابَعون" })).toHaveAttribute("href", "/users/user-1/following");
  });

  it("handles error when user not found", async () => {
    mockedApi.getUser.mockRejectedValue(new Error("User not found"));
    render(<PublicUserPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("User not found");
  });

  it("handles loading state", () => {
    render(<PublicUserPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });
});
