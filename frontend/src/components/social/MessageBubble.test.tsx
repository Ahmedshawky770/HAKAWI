/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MessageBubble } from "@/components/social/MessageBubble";
import type { Message } from "@/types/api";

const MESSAGE: Message = {
  id: "message-1",
  conversationId: "conversation-1",
  senderId: "user-1",
  content: "هل رأيت المسابقة الجديدة؟",
  isRead: true,
  readAt: "2026-01-01T11:00:00.000Z",
  createdAt: "2026-01-01T10:30:00.000Z",
};

describe("MessageBubble", () => {
  it("gives the reader's own message the accent pair and labels it", () => {
    const { container } = render(<MessageBubble message={MESSAGE} isOwn intl="ar-EG" />);
    const bubble = container.querySelector("li > div");

    expect(bubble?.className).toContain("bg-accent-fill");
    expect(bubble?.className).toContain("text-on-accent");
    expect(screen.getByText("أنت")).toBeInTheDocument();
  });

  it("gives anyone else's message the raised surface", () => {
    const { container } = render(<MessageBubble message={MESSAGE} isOwn={false} intl="ar-EG" />);
    const bubble = container.querySelector("li > div");

    expect(bubble?.className).toContain("bg-surface-raised");
    expect(bubble?.className).toContain("text-ink");
    expect(screen.queryByText("أنت")).not.toBeInTheDocument();
  });

  it("aligns by flex justification rather than a physical side", () => {
    const own = render(<MessageBubble message={MESSAGE} isOwn intl="ar-EG" />);
    expect(own.container.querySelector("li")?.className).toContain("justify-end");

    const other = render(<MessageBubble message={MESSAGE} isOwn={false} intl="ar-EG" />);
    expect(other.container.querySelector("li")?.className).toContain("justify-start");
  });

  it("renders the content and a locale-aware time", () => {
    const { container } = render(<MessageBubble message={MESSAGE} isOwn={false} intl="ar-EG" />);

    expect(screen.getByText(MESSAGE.content)).toBeInTheDocument();
    expect(container.querySelector(".hk-numeric")?.textContent).toBe(
      new Date(MESSAGE.createdAt).toLocaleTimeString("ar-EG"),
    );
  });
});