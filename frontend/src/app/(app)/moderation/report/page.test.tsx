/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { AUTH_USER } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
import ReportPage from "@/app/(app)/moderation/report/page";

vi.mock("@/lib/api", () => ({
  api: {
    createReport: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("report form", () => {
  beforeEach(() => {
    mockedApi.createReport.mockResolvedValue({
      id: "report-1",
      reporterId: AUTH_USER.id,
      targetId: "story-9",
      targetType: "story",
      reason: "محتوى مسيء",
      description: null,
      status: "open",
      source: "user",
      escalatedAt: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("files a report with the target, the reason and the description", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportPage />);

    await user.type(screen.getByLabelText("معرّف الهدف"), "story-9");
    await user.type(screen.getByLabelText("السبب"), "محتوى مسيء");
    await user.type(screen.getByLabelText("وصف إضافي"), "تفاصيل إضافية");
    await user.click(screen.getByRole("button", { name: "إرسال التقرير" }));

    await waitFor(() => {
      expect(mockedApi.createReport).toHaveBeenCalledWith({
        targetId: "story-9",
        targetType: "story",
        reason: "محتوى مسيء",
        description: "تفاصيل إضافية",
      });
    });
  });

  it("reports a rejected report without showing the server's own wording", async () => {
    const user = userEvent.setup();
    mockedApi.createReport.mockRejectedValue(new Error("Report already exists"));

    renderWithProviders(<ReportPage />);

    await user.type(screen.getByLabelText("معرّف الهدف"), "story-9");
    await user.type(screen.getByLabelText("السبب"), "محتوى مسيء");
    await user.click(screen.getByRole("button", { name: "إرسال التقرير" }));

    expect(await screen.findByText("فشل إرسال التقرير")).toBeInTheDocument();
    expect(screen.queryByText("Report already exists")).not.toBeInTheDocument();
  });
});
