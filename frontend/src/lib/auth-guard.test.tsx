import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { api } from "@/lib/api";
import { LOGIN_ROUTE } from "@/lib/routes";

import { isUnauthenticatedFailure, useAuthGuard } from "./auth-guard";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
}));

function GuardHarness() {
  const { status, retry } = useAuthGuard();

  return (
    <div>
      <span data-testid="status">{status}</span>
      <button type="button" onClick={retry}>
        retry
      </button>
    </div>
  );
}

describe("useAuthGuard", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the loading state until the session probe resolves", async () => {
    let resolveSession: (() => void) | null = null;
    vi.spyOn(api, "getSession").mockReturnValue(
      new Promise((resolve) => {
        resolveSession = () =>
          resolve({ user: { id: "u", email: "e", name: "n", username: "u", accountType: "reader" }, expiresAt: "x" });
      }),
    );

    render(<GuardHarness />);

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await act(async () => {
      resolveSession?.();
    });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
  });

  it("sends a signed-out visitor to the login route instead of rendering the app", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("Request failed (401): Unauthorized"));

    render(<GuardHarness />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LOGIN_ROUTE));
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
  });

  it("treats a missing token as signed out", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("No token provided"));

    render(<GuardHarness />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
  });

  it("classifies an unauthorized probe and a transport failure differently", () => {
    expect(isUnauthenticatedFailure(new Error("Request failed (401): Unauthorized"))).toBe(true);
    expect(isUnauthenticatedFailure(new Error("No token provided"))).toBe(true);
    expect(isUnauthenticatedFailure(new Error("Network request failed"))).toBe(false);
    expect(isUnauthenticatedFailure("Unauthorized")).toBe(true);
  });

  it("reports an error instead of bouncing the user when the probe itself fails", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("Network request failed"));

    render(<GuardHarness />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("probes again when the retry handler is used", async () => {
    const getSession = vi
      .spyOn(api, "getSession")
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({
        user: { id: "u", email: "e", name: "n", username: "u", accountType: "reader" },
        expiresAt: "x",
      });

    render(<GuardHarness />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));

    await act(async () => {
      screen.getByRole("button", { name: "retry" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("only probes once per mount when nothing changes", async () => {
    const getSession = vi.spyOn(api, "getSession").mockResolvedValue({
      user: { id: "u", email: "e", name: "n", username: "u", accountType: "reader" },
      expiresAt: "x",
    });

    render(<GuardHarness />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    expect(getSession).toHaveBeenCalledTimes(1);
  });
});
