/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import {
  ConversationListEmpty,
  ConversationListSkeleton,
  ConversationRow,
} from "@/components/social/ConversationRow";
import type { Conversation } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const CONVERSATION: Conversation = {
  id: "conversation-1",
  participant1Id: "user-1",
  participant2Id: "user-2",
  participant: { id: "user-2", name: "أحمد محمد" },
  lastMessage: { content: "هل رأيت المسابقة الجديدة؟", createdAt: "2026-01-01T10:00:00.000Z" },
  unreadCount: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ConversationRow", () => {
  it("links the whole row to the conversation", () => {
    renderWithProviders(<ConversationRow conversation={CONVERSATION} />);

    const link = screen.getByRole("link", { name: /أحمد محمد/ });
    expect(link).toHaveAttribute("href", "/messages/conversation-1");
  });

  it("shows the participant, an avatar and the last message on one line", () => {
    const { container } = renderWithProviders(<ConversationRow conversation={CONVERSATION} />);

    expect(screen.getByText("أحمد محمد")).toBeInTheDocument();
    expect(screen.getByText(CONVERSATION.lastMessage?.content as string)).toBeInTheDocument();
    expect(container.querySelector(".truncate")).not.toBeNull();
    expect(container.querySelector(".line-clamp-1")).toBeNull();
  });

  it("announces what the unread figure counts", () => {
    renderWithProviders(<ConversationRow conversation={CONVERSATION} />);

    const count = screen.getByText("3");
    expect(count.className).toContain("hk-numeric");
    expect(screen.getByText("رسائل غير مقروءة")).toHaveClass("sr-only");
  });

  it("drops the unread badge entirely for a conversation with nothing unread", () => {
    renderWithProviders(<ConversationRow conversation={{ ...CONVERSATION, unreadCount: 0 }} />);
    expect(screen.queryByText("رسائل غير مقروءة")).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when the conversation carries no last message", () => {
    renderWithProviders(<ConversationRow conversation={{ ...CONVERSATION, lastMessage: undefined }} />);
    expect(screen.getByText("لا توجد رسائل بعد")).toBeInTheDocument();
  });

  it("marks no row as the current page", () => {
    renderWithProviders(<ConversationRow conversation={CONVERSATION} />);
    expect(screen.getByRole("link", { name: /أحمد محمد/ })).not.toHaveAttribute("aria-current");
  });
});

describe("ConversationListSkeleton", () => {
  it("hides the placeholders from assistive technology", () => {
    const { container } = renderWithProviders(<ConversationListSkeleton count={4} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThanOrEqual(8);
  });
});

describe("ConversationListEmpty", () => {
  it("says there is no conversation yet, in Arabic", () => {
    renderWithProviders(<ConversationListEmpty />);
    expect(screen.getByRole("heading", { name: "لا توجد محادثات بعد" })).toBeInTheDocument();
  });
});