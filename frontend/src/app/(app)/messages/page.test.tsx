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
import { messagesListResponseSchema } from "@/lib/schemas";

import MessagesPage from "@/app/(app)/messages/page";

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
    listStories: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("Messages page", () => {
  const mockMessages = [
    {
      id: "msg-1",
      conversationId: "conv-1",
      lastMessage: "مرحبا",
      lastMessageTime: new Date().toISOString(),
      unreadCount: 2,
    },
  ];

  beforeEach(() => {
    mockedApi.listStories.mockResolvedValue({
      stories: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("renders the page title", () => {
    render(<MessagesPage />);
    expect(screen.getByRole("heading", { name: "الرسائل" })).toBeInTheDocument();
  });

  it("shows loading state on mount", () => {
    render(<MessagesPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("handles empty state", () => {
    render(<MessagesPage />);
    expect(screen.getByText("لا توجد رسائل بعد")).toBeInTheDocument();
  });
});