/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { router } from "@/test-utils/navigation-mock";
import { createDeferred } from "@/test-utils/support";
import { createTestQueryClient, renderWithProviders } from "@/test-utils/render";
import { api, clearStoredUser, getStoredRefreshToken } from "@/lib/api";
import { LogoutButton } from "@/components/layout/LogoutButton";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/api", () => ({
  api: {
    logout: vi.fn(),
  },
  clearStoredUser: vi.fn(),
  getStoredRefreshToken: vi.fn(() => null),
  setStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedClearStoredUser = vi.mocked(clearStoredUser);
const mockedGetStoredRefreshToken = vi.mocked(getStoredRefreshToken);

const SIGN_OUT = "تسجيل الخروج";

function signOut() {
  return userEvent.click(screen.getByRole("button", { name: SIGN_OUT }));
}

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.logout.mockResolvedValue({ message: "Logged out" });
    mockedGetStoredRefreshToken.mockReturnValue(null);
  });

  it("renders a sign out button", () => {
    renderWithProviders(<LogoutButton />);
    expect(screen.getByRole("button", { name: SIGN_OUT })).toBeEnabled();
  });

  it("calls the logout endpoint", async () => {
    renderWithProviders(<LogoutButton />);

    await signOut();

    await waitFor(() => {
      expect(mockedApi.logout).toHaveBeenCalledTimes(1);
    });
  });

  it("forwards the stored refresh token when the client holds one", async () => {
    mockedGetStoredRefreshToken.mockReturnValue("refresh-token");
    renderWithProviders(<LogoutButton />);

    await signOut();

    await waitFor(() => {
      expect(mockedApi.logout).toHaveBeenCalledWith("refresh-token");
    });
  });

  it("clears the stored user and its tokens", async () => {
    renderWithProviders(<LogoutButton />);

    await signOut();

    await waitFor(() => {
      expect(mockedClearStoredUser).toHaveBeenCalledTimes(1);
    });
  });

  it("sends the visitor back to the login page", async () => {
    renderWithProviders(<LogoutButton />);

    await signOut();

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/login");
    });
  });

  it("clears the session even when the server refuses the logout", async () => {
    mockedApi.logout.mockRejectedValue(new Error("Invalid refresh token"));
    renderWithProviders(<LogoutButton />);

    await signOut();

    await waitFor(() => {
      expect(mockedClearStoredUser).toHaveBeenCalledTimes(1);
    });
    expect(router.push).toHaveBeenCalledWith("/login");
  });

  it("ends the local session even when the network is unreachable", async () => {
    mockedApi.logout.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithProviders(<LogoutButton />);

    await signOut();

    await waitFor(() => {
      expect(mockedClearStoredUser).toHaveBeenCalledTimes(1);
    });
    expect(router.push).toHaveBeenCalledWith("/login");
  });

  it("disables the control while the logout request is in flight", async () => {
    const deferred = createDeferred<{ message: string }>();
    mockedApi.logout.mockReturnValue(deferred.promise);
    renderWithProviders(<LogoutButton />);

    const button = screen.getByRole("button", { name: SIGN_OUT });
    await signOut();

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    deferred.resolve({ message: "Logged out" });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  it("ignores a second click while the first logout is still in flight", async () => {
    const deferred = createDeferred<{ message: string }>();
    mockedApi.logout.mockReturnValue(deferred.promise);
    renderWithProviders(<LogoutButton />);

    const button = screen.getByRole("button", { name: SIGN_OUT });
    await signOut();
    await userEvent.click(button);

    expect(mockedApi.logout).toHaveBeenCalledTimes(1);
    deferred.resolve({ message: "Logged out" });
    await waitFor(() => {
      expect(mockedClearStoredUser).toHaveBeenCalledTimes(1);
    });
  });

  it("clears the cached feed, so the next reader never sees this reader's data", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["stories", "feed", {}], { pages: [{ stories: [{ id: "story-1" }] }] });

    renderWithProviders(<LogoutButton />, { queryClient });

    await signOut();

    await waitFor(() => {
      expect(queryClient.getQueryData(["stories", "feed", {}])).toBeUndefined();
    });
  });

  it("really removes both storage keys through the api module", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    actual.setStoredUser({ id: "user-1", email: "a@b.c", name: "أحمد" });
    window.localStorage.setItem("hakawi_tokens", JSON.stringify({ refreshToken: "r" }));
    expect(window.localStorage.getItem("hakawi_user")).not.toBeNull();

    actual.clearStoredUser();

    expect(window.localStorage.getItem("hakawi_user")).toBeNull();
    expect(window.localStorage.getItem("hakawi_tokens")).toBeNull();
  });
});
