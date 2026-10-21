/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { api } from "@/lib/api";
import MessagesPage from "@/app/(app)/messages/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getConversations: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("Messages page", () => {
  beforeEach(() => {
    mockedApi.getConversations.mockResolvedValue({
      conversations: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("renders the page title", () => {
    renderWithProviders(<MessagesPage />);
    expect(screen.getByRole("heading", { name: "الرسائل" })).toBeInTheDocument();
  });

  it("shows loading state on mount", () => {
    renderWithProviders(<MessagesPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("handles empty state", async () => {
    renderWithProviders(<MessagesPage />);
    expect(await screen.findByRole("heading", { name: "لا توجد محادثات بعد" })).toBeInTheDocument();
  });
});
