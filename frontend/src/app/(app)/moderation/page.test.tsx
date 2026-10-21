/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { renderWithProviders } from "@/test-utils/render";
import ModerationDashboardPage from "@/app/(app)/moderation/page";

vi.mock("@/lib/api", () => ({
  api: {
    getModerationQueue: vi.fn(),
    moderateItem: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const REPORT = {
  id: "report-1",
  reporterId: "user-2",
  targetId: "story-9",
  targetType: "story" as const,
  reason: "محتوى مسيء",
  description: "التفاصيل",
  status: "open" as const,
  source: "user" as const,
  escalatedAt: null,
  resolvedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("moderation dashboard", () => {
  beforeEach(() => {
    mockedApi.getModerationQueue.mockResolvedValue({
      reports: [REPORT],
      total: 1,
      page: 1,
      limit: 20,
    });
    mockedApi.moderateItem.mockResolvedValue({ ...REPORT, status: "in_review" });
  });

  it("lists the reports in the queue", async () => {
    renderWithProviders(<ModerationDashboardPage />);

    expect(await screen.findByText("معرّف الهدف: story-9")).toBeInTheDocument();
    expect(screen.getByText("النوع: قصة")).toBeInTheDocument();
    expect(screen.getByText("الحالة: مفتوح")).toBeInTheDocument();
  });

  it("says when the queue is empty", async () => {
    mockedApi.getModerationQueue.mockResolvedValue({ reports: [], total: 0, page: 1, limit: 20 });

    renderWithProviders(<ModerationDashboardPage />);

    expect(await screen.findByText("لا توجد بلاغات معلّقة.")).toBeInTheDocument();
  });

  it("reports the failure of the queue with a retry", async () => {
    mockedApi.getModerationQueue.mockRejectedValue(new Error("queue is down"));

    renderWithProviders(<ModerationDashboardPage />);

    expect(await screen.findByText("فشل تحميل لوحة الاعتدال")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
  });

  it("takes an action on a report and refetches the queue", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModerationDashboardPage />);

    await screen.findByText("معرّف الهدف: story-9");
    await user.click(screen.getByRole("button", { name: "قيد المراجعة" }));

    await waitFor(() => {
      expect(mockedApi.moderateItem).toHaveBeenCalledWith("report-1", { status: "in_review" });
    });
    // The write invalidates the queue, so the server is asked again.
    await waitFor(() => {
      expect(mockedApi.getModerationQueue.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
