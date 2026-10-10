/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";


vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));
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
    render(<AuthCallbackPage />);
    expect(screen.getByText("جاري إكمال تسجيل الدخول...")).toBeInTheDocument();
  });

  it("stores the session user and replaces the history with the authenticated home", async () => {
    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/");
    });
    expect(mockedSetStoredUser).toHaveBeenCalledWith({ ...AUTH_USER });
  });

  it("never replaces the history with the removed dashboard route", async () => {
    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled();
    });
    expect(router.replace).not.toHaveBeenCalledWith("/dashboard");
  });

  it("renders the page title as a level one heading", () => {
    mockedApi.getSession.mockReturnValue(new Promise(() => undefined));
    render(<AuthCallbackPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders the failure of an expired session inside an alert region", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    render(<AuthCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid session");
  });

  it("requests the session exactly once per callback", async () => {
    render(<AuthCallbackPage />);
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled();
    });
    expect(mockedApi.getSession).toHaveBeenCalledTimes(1);
  });

  it("renders the failure of an expired session and stays put", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    render(<AuthCallbackPage />);

    expect(await screen.findByText("Invalid session")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockedSetStoredUser).not.toHaveBeenCalled();
  });

  it("renders the unauthorized failure raised by a missing session", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Unauthorized"));
    render(<AuthCallbackPage />);

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("stops announcing the pending state once the callback failed", async () => {
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    render(<AuthCallbackPage />);

    await screen.findByText("Invalid session");
    expect(screen.queryByText("جاري إكمال تسجيل الدخول...")).not.toBeInTheDocument();
  });
});
