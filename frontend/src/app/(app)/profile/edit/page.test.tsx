/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { api, getStoredUser } from "@/lib/api";

import { AUTH_USER } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
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
    updateMe: vi.fn(),
  },
  getStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedGetStoredUser = vi.mocked(getStoredUser);

const mockUser = {
  id: "user-1",
  name: "أحمد محمد",
  username: "ahmed",
  avatar: "https://example.com/avatar.jpg",
  bio: "كاتب قصص",
  accountType: "rising_star" as const,
  isVerified: true,
  createdAt: new Date().toISOString(),
};

describe("Profile edit page", () => {
  beforeEach(() => {
    mockedGetStoredUser.mockReturnValue(AUTH_USER);
    mockedApi.getUser.mockResolvedValue(mockUser);
  });

  it("renders the profile edit heading", async () => {
    renderWithProviders(<ProfileEditPage />);
    expect(await screen.findByRole("heading", { name: "تعديل الملف الشخصي" })).toBeInTheDocument();
  });

  it("shows loading state", () => {
    renderWithProviders(<ProfileEditPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });
});