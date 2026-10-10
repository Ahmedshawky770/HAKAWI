/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  NotificationListEmpty,
  NotificationListSkeleton,
  NotificationRow,
  notificationIcon,
} from "@/components/social/NotificationRow";
import type { Notification } from "@/types/api";

const UNREAD: Notification = {
  id: "notification-1",
  userId: "user-1",
  type: "story_reaction",
  title: "تفاعل جديد",
  message: "أعجب someone بقصتك",
  data: null,
  isRead: false,
  readAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
};

describe("NotificationRow", () => {
  it("marks an unread notification with the accent edge and the word جديد", () => {
    const { container } = render(<NotificationRow notification={UNREAD} onMarkAsRead={() => undefined} />);
    const card = container.firstElementChild;

    expect(card?.className).toContain("border-s-2");
    expect(card?.className).toContain("border-s-accent");
    expect(card?.className).not.toMatch(/border-l-|border-r-/);
    expect(screen.getByText("جديد")).toBeInTheDocument();
  });

  it("carries neither marker once the notification has been read", () => {
    const { container } = render(
      <NotificationRow notification={{ ...UNREAD, isRead: true }} onMarkAsRead={() => undefined} />,
    );

    expect(container.firstElementChild?.className).not.toContain("border-s-accent");
    expect(screen.queryByText("جديد")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the title as a heading and the body as text", () => {
    render(<NotificationRow notification={UNREAD} onMarkAsRead={() => undefined} />);

    expect(screen.getByRole("heading", { name: UNREAD.title })).toBeInTheDocument();
    expect(screen.getByText(UNREAD.message)).toBeInTheDocument();
  });

  it("offers the Arabic ghost action only while the notification is unread", async () => {
    const user = userEvent.setup();
    const onMarkAsRead = vi.fn();

    render(<NotificationRow notification={UNREAD} onMarkAsRead={onMarkAsRead} />);
    const button = screen.getByRole("button", { name: "تعليم كمقروء" });
    expect(button.className).toContain("text-ink-muted");

    await user.click(button);
    expect(onMarkAsRead).toHaveBeenCalledWith(UNREAD.id);
  });

  it("keeps the action in place while its request is in flight", () => {
    render(<NotificationRow notification={UNREAD} onMarkAsRead={() => undefined} isPending />);

    const button = screen.getByRole("button", { name: "تعليم كمقروء" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});

describe("notificationIcon", () => {
  it("picks the glyph of the notification kind", () => {
    expect(notificationIcon("message")).toBe("message");
    expect(notificationIcon("payment")).toBe("wallet");
    expect(notificationIcon("contest")).toBe("trophy");
    expect(notificationIcon("follow")).toBe("users");
  });

  it("falls back to the bell for a kind it does not know", () => {
    expect(notificationIcon("something-new")).toBe("bell");
  });
});

describe("NotificationListSkeleton", () => {
  it("hides the placeholders from assistive technology", () => {
    const { container } = render(<NotificationListSkeleton count={5} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThanOrEqual(10);
  });
});

describe("NotificationListEmpty", () => {
  it("says there is no notification yet, in Arabic", () => {
    render(<NotificationListEmpty />);
    expect(screen.getByRole("heading", { name: "لا توجد إشعارات بعد." })).toBeInTheDocument();
  });
});