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
import PublicUserPage from "@/app/(app)/users/[id]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getUser: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("Public user profile page", () => {
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

  beforeEach(() => {
    mockedApi.getUser.mockResolvedValue(mockUser);
  });

  it("renders the user name", () => {
    render(<PublicUserPage />);
    expect(screen.getByRole("heading", { name: "أحمد محمد" })).toBeInTheDocument();
  });

  it("renders the user username", () => {
    render(<PublicUserPage />);
    expect(screen.getByText("@ahmed")).toBeInTheDocument();
  });

  it("renders the user bio", () => {
    render(<PublicUserPage />);
    expect(screen.getByText("كاتب قصص")).toBeInTheDocument();
  });

  it("renders the user avatar", () => {
    render(<PublicUserPage />);
    const avatarImg = screen.getByAltText("أحمد محمد");
    expect(avatarImg).toBeInTheDocument();
  });

  it("renders follow and following links", () => {
    render(<PublicUserPage />);
    expect(screen.getByRole("link", { name: "المتابعون" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "المتابَعون" })).toBeInTheDocument();
  });

  it("handles error when user not found", () => {
    mockedApi.getUser.mockRejectedValue(new Error("User not found"));
    render(<PublicUserPage />);
    expect(screen.getByText("المستخدم غير موجود")).toBeInTheDocument();
  });

  it("handles loading state", () => {
    mockedApi.getUser.mockResolvedValue({
      id: "user-1",
      name: "أحمد محمد",
      username: "ahmed",
      bio: "كاتب قصص",
      avatar: "https://example.com/avatar.jpg",
      accountType: "writer" as const,
      isVerified: true,
      createdAt: new Date().toISOString(),
    });
    render(<PublicUserPage />);
    expect(screen.getByText("المستخدم غير موجود")).toBeInTheDocument();
  });
});