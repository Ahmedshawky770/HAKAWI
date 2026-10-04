/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NOTIFICATION } from "@/test-utils/fixtures";
import { createDeferred } from "@/test-utils/support";
import { api } from "@/lib/api";
import type { Notification } from "@/types/api";
import NotificationsPage from "@/app/(app)/notifications/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getNotifications: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
    markNotificationAsRead: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const READ_NOTIFICATION: Notification = {
  ...NOTIFICATION,
  id: "notification-2",
  title: "قصة جديدة",
  message: "نشرت someone قصة جديدة",
  isRead: true,
  readAt: "2026-01-01T11:00:00.000Z",
};

/**
 * The unread counter is one `role="status"`-free text label beside the figure,
 * so these two helpers keep the assertions about the COUNT readable instead of
 * asserting on a whole string that has to change whenever the copy is edited.
 */
function unreadLabel(): HTMLElement {
  return screen.getByText("إشعار غير مقروء");
}

function unreadValue(): string | null {
  return unreadLabel().previousElementSibling?.textContent ?? null;
}

describe("notifications page", () => {
  beforeEach(() => {
    mockedApi.getNotifications.mockResolvedValue({
      notifications: [{ ...NOTIFICATION }, READ_NOTIFICATION],
      total: 2,
      page: 1,
      limit: 20,
    });
    mockedApi.getUnreadNotificationCount.mockResolvedValue({ count: 1 });
    mockedApi.markNotificationAsRead.mockResolvedValue({
      ...NOTIFICATION,
      isRead: true,
      readAt: "2026-01-01T12:00:00.000Z",
    });
  });

  it("announces a loading state while the notifications are fetched", () => {
    const listDeferred = createDeferred<{
      notifications: Notification[];
      total: number;
      page: number;
      limit: number;
    }>();
    const countDeferred = createDeferred<{ count: number }>();
    mockedApi.getNotifications.mockReturnValue(listDeferred.promise);
    mockedApi.getUnreadNotificationCount.mockReturnValue(countDeferred.promise);

    render(<NotificationsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("requests the first page of notifications", async () => {
    render(<NotificationsPage />);
    await screen.findByText(NOTIFICATION.title);
    expect(mockedApi.getNotifications).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("renders the title and the body of every notification", async () => {
    render(<NotificationsPage />);

    expect(await screen.findByRole("heading", { name: NOTIFICATION.title })).toBeInTheDocument();
    expect(screen.getByText(NOTIFICATION.message)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: READ_NOTIFICATION.title })).toBeInTheDocument();
    expect(screen.getByText(READ_NOTIFICATION.message)).toBeInTheDocument();
  });

  it("shows the unread count returned by the dedicated count endpoint", async () => {
    render(<NotificationsPage />);

    expect(await screen.findByText("إشعار غير مقروء")).toBeInTheDocument();
    expect(unreadValue()).toBe("1");
    expect(mockedApi.getUnreadNotificationCount).toHaveBeenCalledTimes(1);
  });

  it("hides the unread counter when everything is read", async () => {
    mockedApi.getNotifications.mockResolvedValue({
      notifications: [READ_NOTIFICATION],
      total: 1,
      page: 1,
      limit: 20,
    });
    mockedApi.getUnreadNotificationCount.mockResolvedValue({ count: 0 });

    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: READ_NOTIFICATION.title });
    expect(screen.queryByText("إشعار غير مقروء")).not.toBeInTheDocument();
  });

  it("renders an explicit empty state when there is no notification", async () => {
    mockedApi.getNotifications.mockResolvedValue({ notifications: [], total: 0, page: 1, limit: 20 });
    mockedApi.getUnreadNotificationCount.mockResolvedValue({ count: 0 });

    render(<NotificationsPage />);

    expect(await screen.findByText("لا توجد إشعارات بعد.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تعليم كمقروء" })).not.toBeInTheDocument();
  });

  it("offers a mark as read action only for an unread notification", async () => {
    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    expect(screen.getAllByRole("button", { name: "تعليم كمقروء" })).toHaveLength(1);
  });

  it("marks a notification as read and decrements the unread counter", async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    await user.click(screen.getByRole("button", { name: "تعليم كمقروء" }));

    await waitFor(() => {
      expect(mockedApi.markNotificationAsRead).toHaveBeenCalledWith(NOTIFICATION.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "تعليم كمقروء" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("إشعار غير مقروء")).not.toBeInTheDocument();
  });

  it("keeps the notification visible after marking it as read", async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    await user.click(screen.getByRole("button", { name: "تعليم كمقروء" }));

    expect(screen.getByRole("heading", { name: NOTIFICATION.title })).toBeInTheDocument();
  });

  it("keeps the unread state when the mark as read request fails", async () => {
    const user = userEvent.setup();
    mockedApi.markNotificationAsRead.mockRejectedValue(new Error("Not your notification"));
    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    await user.click(screen.getByRole("button", { name: "تعليم كمقروء" }));

    await waitFor(() => {
      expect(mockedApi.markNotificationAsRead).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "تعليم كمقروء" })).toBeInTheDocument();
    expect(screen.getByText("إشعار غير مقروء")).toBeInTheDocument();
  });

  it("renders the failure of the notification list", async () => {
    mockedApi.getNotifications.mockRejectedValue(new Error("Failed to load notifications"));

    render(<NotificationsPage />);

    expect(await screen.findByText("Failed to load notifications")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "الإشعارات" })).not.toBeInTheDocument();
  });

  it("renders the unauthorized failure of a session that expired", async () => {
    mockedApi.getNotifications.mockRejectedValue(new Error("Unauthorized"));

    render(<NotificationsPage />);

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("keeps the loaded list when only the unread count request fails", async () => {
    mockedApi.getUnreadNotificationCount.mockRejectedValue(new Error("Failed to load notifications"));

    render(<NotificationsPage />);

    expect(await screen.findByRole("heading", { name: NOTIFICATION.title })).toBeInTheDocument();
    expect(screen.getByText(NOTIFICATION.message)).toBeInTheDocument();
    expect(screen.queryByText("Failed to load notifications")).not.toBeInTheDocument();
  });

  it("reports the unread count as unavailable when only the count request fails", async () => {
    mockedApi.getUnreadNotificationCount.mockRejectedValue(new Error("Failed to load notifications"));

    render(<NotificationsPage />);

    expect(await screen.findByText("تعذّر جلب العدد")).toBeInTheDocument();
    expect(screen.queryByText("إشعار غير مقروء")).not.toBeInTheDocument();
  });

  it("does not claim a zero unread count when the count request failed", async () => {
    mockedApi.getNotifications.mockResolvedValue({ notifications: [], total: 0, page: 1, limit: 20 });
    mockedApi.getUnreadNotificationCount.mockRejectedValue(new Error("Failed to load notifications"));

    render(<NotificationsPage />);

    expect(await screen.findByText("تعذّر جلب العدد")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("still offers the mark as read action when the count request failed", async () => {
    mockedApi.getUnreadNotificationCount.mockRejectedValue(new Error("Failed to load notifications"));

    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    expect(screen.getByRole("button", { name: "تعليم كمقروء" })).toBeInTheDocument();
  });

  it("keeps the unavailable count after marking a notification as read", async () => {
    const user = userEvent.setup();
    mockedApi.getUnreadNotificationCount.mockRejectedValue(new Error("Failed to load notifications"));

    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    await user.click(screen.getByRole("button", { name: "تعليم كمقروء" }));

    await waitFor(() => {
      expect(mockedApi.markNotificationAsRead).toHaveBeenCalledWith(NOTIFICATION.id);
    });
    expect(screen.getByText("تعذّر جلب العدد")).toBeInTheDocument();
  });

  it("requests both the list and the count exactly once", async () => {
    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: NOTIFICATION.title });
    expect(mockedApi.getNotifications).toHaveBeenCalledTimes(1);
    expect(mockedApi.getUnreadNotificationCount).toHaveBeenCalledTimes(1);
  });

  it("stops announcing the loading state once the page is ready", async () => {
    render(<NotificationsPage />);

    await screen.findByRole("heading", { name: "الإشعارات" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});