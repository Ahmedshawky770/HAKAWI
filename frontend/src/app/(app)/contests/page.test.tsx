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
import { contestsListResponseSchema, contestSchema } from "@/lib/schemas";
import { z } from "zod";

import ContestsPage from "@/app/(app)/contests/page";

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
    listContests: vi.fn(),
    getContest: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const contestDefaults = {
  id: "contest-1",
  title: "مسابقة القصص القصيرة",
  description: "أفضل قصة في الشهر",
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  submissionDeadline: new Date().toISOString(),
  categoryId: "cat-1",
  status: "active",
  createdBy: "user-1",
  winnerId: null,
  prize: "1000 ج.م",
  rules: "قواعد المسابقة",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Contests list page", () => {
  beforeEach(() => {
    mockedApi.listContests.mockResolvedValue({
      contests: [contestDefaults],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("renders the page title", () => {
    render(<ContestsPage />);
    expect(screen.getByRole("heading", { name: "المنافسات" })).toBeInTheDocument();
  });

  it("calls listContests on mount", async () => {
    render(<ContestsPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.listContests).toHaveBeenCalled();
  });

  it("handles loading state", () => {
    render(<ContestsPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("displays contests when available", async () => {
    render(<ContestsPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("مسابقة القصص القصيرة")).toBeInTheDocument();
  });
});