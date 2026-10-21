/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { formatDate, intlLocale, stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";

import { renderWithProviders } from "@/test-utils/render";
import UsersFollowersPage from "@/app/(app)/users/[id]/followers/page";

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
    getFollowers: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockFollowers = {
  followers: [
    { id: "user-2", name: "علي محمد", username: "ali", avatar: null, followerId: "user-2", followingId: "user-1", createdAt: new Date().toISOString() },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

describe("Users followers page", () => {
  beforeEach(() => {
    mockedApi.getFollowers.mockResolvedValue(mockFollowers);
  });

  it("renders the page title", async () => {
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(screen.getByRole("heading", { name: "المتابعون" })).toBeInTheDocument();
  });

  it("loads followers on mount", async () => {
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    expect(mockedApi.getFollowers).toHaveBeenCalledWith("user-1", { page: 1, limit: 20 });
  });

  it("renders the follower rows", async () => {
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));
    // The list arrives through the query cache, so the row is waited for.
    expect(await screen.findByText("متابع")).toBeInTheDocument();
    const joined = formatDate(mockFollowers.followers[0].createdAt, intlLocale(DEFAULT_LOCALE));
    expect(screen.getByText(joined)).toBeInTheDocument();
  });

  it("announces a failed request instead of claiming the list is empty", async () => {
    mockedApi.getFollowers.mockRejectedValueOnce(new Error("request failed"));
    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(stringsFor(DEFAULT_LOCALE).errors.unknown);
    // The empty state is a sentence about the world; the server never said it.
    expect(
      screen.queryByText(stringsFor(DEFAULT_LOCALE).social.followEmptyFollowers),
    ).not.toBeInTheDocument();
  });

  it("asks the server again when the reader retries", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.getFollowers.mockRejectedValueOnce(new Error("request failed"));

    renderWithProviders(await UsersFollowersPage({ params: Promise.resolve({ id: "user-1" }) }));

    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: stringsFor(DEFAULT_LOCALE).common.retry }));

    expect(await screen.findByText("متابع")).toBeInTheDocument();
    expect(mockedApi.getFollowers).toHaveBeenCalledTimes(2);
  });
});
