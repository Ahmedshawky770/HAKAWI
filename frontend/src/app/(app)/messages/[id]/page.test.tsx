/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { api, getStoredUser } from "@/lib/api";
import { AUTH_USER } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";
import ConversationPage from "@/app/(app)/messages/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "conversation-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
  getStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedGetStoredUser = vi.mocked(getStoredUser);

const MESSAGES = {
  messages: [
    {
      id: "message-1",
      conversationId: "conversation-1",
      senderId: "user-2",
      content: "هل رأيت المسابقة الجديدة؟",
      isRead: true,
      readAt: "2026-01-01T11:00:00.000Z",
      createdAt: "2026-01-01T10:30:00.000Z",
    },
    {
      id: "message-2",
      conversationId: "conversation-1",
      senderId: AUTH_USER.id,
      content: "نعم، قرأتها الآن.",
      isRead: true,
      readAt: "2026-01-01T11:00:00.000Z",
      createdAt: "2026-01-01T10:31:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
};

describe("conversation page", () => {
  beforeAll(() => {
    // jsdom implements neither `scrollIntoView` nor the scrolling it triggers,
    // and the thread scrolls to the newest message on every answer.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    mockedGetStoredUser.mockReturnValue(AUTH_USER);
    mockedApi.getMessages.mockResolvedValue(MESSAGES);
    mockedApi.sendMessage.mockResolvedValue({
      id: "message-3",
      conversationId: "conversation-1",
      senderId: AUTH_USER.id,
      content: "رسالة جديدة",
      isRead: false,
      readAt: null,
      createdAt: "2026-01-01T10:40:00.000Z",
    });
  });

  it("renders the thread as a log region", async () => {
    renderWithProviders(<ConversationPage />);

    const log = await screen.findByRole("log");
    expect(log).toBeInTheDocument();
    expect(screen.getByText("هل رأيت المسابقة الجديدة؟")).toBeInTheDocument();
    expect(screen.getByText("نعم، قرأتها الآن.")).toBeInTheDocument();
  });

  it("labels the reader's own side of the thread", async () => {
    renderWithProviders(<ConversationPage />);

    expect(await screen.findByText("أنت")).toBeInTheDocument();
  });

  it("says when the conversation holds no message", async () => {
    mockedApi.getMessages.mockResolvedValue({ messages: [], total: 0, page: 1, limit: 20 });

    renderWithProviders(<ConversationPage />);

    expect(await screen.findByText("لا توجد رسائل بعد")).toBeInTheDocument();
  });

  it("sends a message and asks the server for the thread again", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConversationPage />);

    await screen.findByRole("log");
    await user.type(screen.getByLabelText("اكتب رسالتك"), "رسالة جديدة");
    await user.click(screen.getByRole("button", { name: "إرسال" }));

    await waitFor(() => {
      expect(mockedApi.sendMessage).toHaveBeenCalledWith("conversation-1", "رسالة جديدة");
    });
    await waitFor(() => {
      expect(mockedApi.getMessages.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("reports a rejected message without showing the server's own wording", async () => {
    const user = userEvent.setup();
    mockedApi.sendMessage.mockRejectedValue(new Error("conversation is closed"));

    renderWithProviders(<ConversationPage />);

    await screen.findByRole("log");
    await user.type(screen.getByLabelText("اكتب رسالتك"), "رسالة جديدة");
    await user.click(screen.getByRole("button", { name: "إرسال" }));

    expect(await screen.findByText("تعذّر إرسال الرسالة")).toBeInTheDocument();
    expect(screen.queryByText("conversation is closed")).not.toBeInTheDocument();
  });
});
