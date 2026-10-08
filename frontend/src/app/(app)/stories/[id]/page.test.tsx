/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock @/lib/api first - MUST be first
const mockGetStory = vi.fn();
const mockDeleteStory = vi.fn();
const mockGetStoredUser = vi.fn(() => ({ id: "user-1" }));

vi.mock("@/lib/api", () => ({
  api: {
    getStory: mockGetStory,
    deleteStory: mockDeleteStory,
    getStoredUser: mockGetStoredUser,
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "story-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock UI components
vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/providers/ToastProvider", () => ({
  useToast: () => ({
    notify: () => {},
  }),
}));
vi.mock("@/components/providers/LocaleProvider", () => ({
  useLocale: () => ({ intl: { formatDate: () => "", formatNumber: () => "" } }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import after all mocks are set up
import StoryDetailPage from "./page";

const mockStory = {
  id: "story-1",
  title: "قصة مميزة",
  author: { id: "user-1", name: "أحمد محمد", username: "ahmed", avatar: null },
  category: "fiction",
  content: "<p>محتوى القصة التجريبي</p>",
  views: 1500,
  reactions: 42,
  createdAt: new Date().toISOString(),
};

describe("Story detail page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetStory.mockResolvedValue(mockStory);
  });

  it("renders the story title", () => {
    render(<StoryDetailPage />);
    expect(screen.getByText("قصة مميزة")).toBeInTheDocument();
  });

  it("renders the story category", () => {
    render(<StoryDetailPage />);
    expect(screen.getByText("فiction")).toBeInTheDocument();
  });

  it("renders the author avatar and name", () => {
    render(<StoryDetailPage />);
    expect(screen.getByAltText("أحمد محمد")).toBeInTheDocument();
  });

  it("renders the story views and reactions", () => {
    render(<StoryDetailPage />);
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockGetStory.mockResolvedValueOnce(null);
    render(<StoryDetailPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("handles error when story not found", async () => {
    mockGetStory.mockRejectedValue(new Error("Story not found"));
    render(<StoryDetailPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("تعذّر فتح القصة")).toBeInTheDocument();
  });

  it("handles delete story action", async () => {
    mockDeleteStory.mockResolvedValue(undefined);
    render(<StoryDetailPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockDeleteStory).toHaveBeenCalledWith("story-1");
  });

  it("shows empty state when story is not found", async () => {
    mockGetStory.mockResolvedValue(null);
    render(<StoryDetailPage />);
    expect(screen.getByText("القصة غير موجودة")).toBeInTheDocument();
  });

  it("renders reaction bar", () => {
    render(<StoryDetailPage />);
    expect(screen.getByRole("button", { name: "تفاعل" })).toBeInTheDocument();
  });
});