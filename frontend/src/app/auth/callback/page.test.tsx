/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { AUTH_USER, SESSION_RESPONSE } from "@/test-utils/fixtures";
import { api, setStoredUser } from "@/lib/api";
import AuthCallbackPage from "@/app/auth/callback/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getSession: vi.fn(),
  },
  setStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedSetStoredUser = vi.mocked(setStoredUser);

describe("auth callback page", () => {
  beforeEach(() => {
    mockedApi.getSession.mockResolvedValue(SESSION_RESPONSE);
  });

  it("announces that the login is being completed while the session is fetched", () => {
    mockedApi.getSession.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<AuthCallbackPage />);
    expect(screen.getByText("جاري إكمال تسجيل الدخول...")).toBeInTheDocument();
  });

  it("stores the session user and replaces the history with the authenticated home", async () => {
    renderWithProviders(<AuthCallbackPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/");
    });
    expect(mockedSetStoredUser).toHaveBeenCalledWith({ ...AUTH_USER });
  });

  it("never replaces the history with the removed dashboard route", async () => {
    renderWithProviders(<AuthCallbackPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled();
    });
    expect(router.replace).not.toHaveBeenCalledWith("/dashboard");
  });

  it("renders the page title as a level one heading", () => {
    mockedApi.getSession.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<AuthCallbackPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("owns the main landmark the skip link targets, in both of its states", () => {
    // The OAuth landing is neither `AppShell`'s frame nor an `AuthShell` page,
    // so without a landmark here the root layout's skip link has a dead target
    // on the one route that can sit in front of the reader indefinitely.
    mockedApi.getSession.mockReturnValue(new Promise(() => undefined));
    const pending = renderWithProviders(<AuthCallbackPage />);
    const pendingMain = pending.container.querySelector("main#main-content");
    expect(pendingMain, "the pending state must render main#main-content").not.toBeNull();
    expect(pendingMain?.getAttribute("tabindex")).toBe("-1");
    pending.unmount();

    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    const failed = renderWithProviders(<AuthCallbackPage />);
    const failedMain = failed.container.querySelector("main#main-content");
    expect(failedMain, "the failed state must render main#main-content").not.toBeNull();
    expect(failedMain?.getAttribute("tabindex")).toBe("-1");
  });

  it("renders the failure of an expired session inside an alert region", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    renderWithProviders(<AuthCallbackPage />);

    // The server's English wording is a fact about the API; the reader is
    // told what it means for them, in their language.
    expect(await screen.findByRole("alert")).toHaveTextContent("انتهت جلستك. سجّل الدخول من جديد.");
  });

  it("requests the session exactly once per callback", async () => {
    renderWithProviders(<AuthCallbackPage />);
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled();
    });
    expect(mockedApi.getSession).toHaveBeenCalledTimes(1);
  });

  it("renders the failure of an expired session and stays put", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    renderWithProviders(<AuthCallbackPage />);

    expect(await screen.findByText("انتهت جلستك. سجّل الدخول من جديد.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockedSetStoredUser).not.toHaveBeenCalled();
  });

  it("renders the unauthorized failure raised by a missing session", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Unauthorized"));
    renderWithProviders(<AuthCallbackPage />);

    expect(await screen.findByText("انتهت جلستك. سجّل الدخول من جديد.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("stops announcing the pending state once the callback failed", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    renderWithProviders(<AuthCallbackPage />);

    await screen.findByText("انتهت جلستك. سجّل الدخول من جديد.");
    expect(screen.queryByText("جاري إكمال تسجيل الدخول...")).not.toBeInTheDocument();
  });
});
