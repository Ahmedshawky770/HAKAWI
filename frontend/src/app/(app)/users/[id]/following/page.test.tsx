/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { formatDate, intlLocale, stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";

import { renderWithProviders } from "@/test-utils/render";
import UsersFollowingPage from "@/app/(app)/users/[id]/following/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: {
    to: "/",
    className: "",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getFollowing: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockFollowing = {
  following: [
    { id: "user-3", name: "محمد علي", username: "mohammed", avatar: null, followerId: "user-1", followingId: "user-3", createdAt: new Date().toISOString() },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

describe("Users following page", () => {
  beforeEach(() => {
    mockedApi.getFollowing.mockResolvedValue(mockFollowing);
  });

  it("renders the page title", async () => {
    renderWithProviders(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByRole("heading", { name: "المتابَعون" })).toBeInTheDocument();
  });

  it("loads following on mount", async () => {
    renderWithProviders(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(mockedApi.getFollowing).toHaveBeenCalledWith("user-1", { page: 1, limit: 20 });
  });

  it("renders the following rows", async () => {
    renderWithProviders(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));
    // The list arrives through the query cache, so the row is waited for.
    expect(await screen.findByText("متابَع")).toBeInTheDocument();
    const joined = formatDate(mockFollowing.following[0].createdAt, intlLocale(DEFAULT_LOCALE));
    expect(screen.getByText(joined)).toBeInTheDocument();
  });

  it("announces a failed request instead of claiming the list is empty", async () => {
    mockedApi.getFollowing.mockRejectedValueOnce(new Error("request failed"));
    renderWithProviders(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(stringsFor(DEFAULT_LOCALE).errors.unknown);
    // The empty state is a sentence about the world; the server never said it.
    expect(
      screen.queryByText(stringsFor(DEFAULT_LOCALE).social.followEmptyFollowing),
    ).not.toBeInTheDocument();
  });

  it("asks the server again when the reader retries", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.getFollowing.mockRejectedValueOnce(new Error("request failed"));

    renderWithProviders(await UsersFollowingPage({ params: Promise.resolve({ id: "user-1" }) }));

    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: stringsFor(DEFAULT_LOCALE).common.retry }));

    expect(await screen.findByText("متابَع")).toBeInTheDocument();
    expect(mockedApi.getFollowing).toHaveBeenCalledTimes(2);
  });
});
