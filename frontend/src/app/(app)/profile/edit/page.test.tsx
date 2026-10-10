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
import { paymentsListResponseSchema } from "@/lib/schemas";

import ProfileEditPage from "@/app/(app)/profile/edit/page";

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
    getUser: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockUser = {
  id: "user-1",
  name: "أحمد محمد",
  username: "ahmed",
  avatar: "https://example.com/avatar.jpg",
  bio: "كاتب قصص",
  accountType: "writer" as const,
  isVerified: true,
  createdAt: new Date().toISOString(),
};

describe("Profile edit page", () => {
  beforeEach(() => {
    mockedApi.getUser.mockResolvedValue(mockUser);
  });

  it("renders the profile edit heading", () => {
    render(<ProfileEditPage />);
    expect(screen.getByRole("heading", { name: "تعديل الملف الشخصي" })).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<ProfileEditPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });
});