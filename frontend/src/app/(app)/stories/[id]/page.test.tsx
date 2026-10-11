/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { mockGetStory, mockDeleteStory, mockGetStoredUser } = vi.hoisted(() => ({
  mockGetStory: vi.fn(),
  mockDeleteStory: vi.fn(),
  mockGetStoredUser: vi.fn(() => ({ id: "user-1" })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getStory: mockGetStory,
    deleteStory: mockDeleteStory,
    getReactionCounts: vi.fn(),
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
  getStoredUser: mockGetStoredUser,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "story-1" }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/components/providers/ToastProvider", () => ({
  useToast: () => ({
    notify: () => {},
  }),
}));
vi.mock("@/components/providers/LocaleProvider", () => ({
  useLocale: () => ({ intl: { formatDate: () => "", formatNumber: () => "" } }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

let queryClient: QueryClient;

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <StoryDetailPage />
    </QueryClientProvider>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("Story detail page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockGetStory.mockResolvedValue(mockStory);
    mockGetStoredUser.mockReturnValue({ id: "user-1" });
  });

  it("renders the story title", async () => {
    renderPage();
    expect(await screen.findByText("قصة مميزة")).toBeInTheDocument();
  });

  it("renders the story category", async () => {
    renderPage();
    expect(await screen.findByText("fiction")).toBeInTheDocument();
  });

  it("renders the author byline and avatar initial", async () => {
    renderPage();
    expect(await screen.findByText("بواسطة أحمد محمد")).toBeInTheDocument();
    expect(screen.getByText("أ")).toBeInTheDocument();
  });

  it("renders the story views and reactions", async () => {
    renderPage();
    expect(await screen.findByText("قصة مميزة")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    mockGetStory.mockResolvedValueOnce(null);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
    await settle();
  });

  it("handles error when story not found", async () => {
    mockGetStory.mockRejectedValueOnce(new Error("Story not found"));
    renderPage();
    expect(await screen.findByText("تعذّر فتح القصة")).toBeInTheDocument();
  });

  it("deletes the story when the owner confirms", async () => {
    renderPage();
    await screen.findByText("قصة مميزة");
    fireEvent.click(screen.getByRole("button", { name: "حذف القصة" }));
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الحذف" }));
    await settle();
    expect(mockDeleteStory).toHaveBeenCalledWith("story-1");
  });

  it("shows empty state when story is not found", async () => {
    mockGetStory.mockResolvedValueOnce(null);
    renderPage();
    expect(await screen.findByText("القصة غير موجودة")).toBeInTheDocument();
  });

  it("renders reaction bar", async () => {
    renderPage();
    expect(await screen.findByRole("group", { name: "التفاعلات" })).toBeInTheDocument();
  });
});
