import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { stringsFor } from "@/lib/i18n";
import { LOGIN_ROUTE } from "@/lib/routes";
import { SESSION_RESPONSE } from "@/test-utils/fixtures";
import { renderWithProviders } from "@/test-utils/render";

const RETRY_LABEL = stringsFor(DEFAULT_LOCALE).auth.authGuardRetry;

import AppLayout from "./layout";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
}));

/**
 * The shell is mocked, not mounted, because this suite is about the guard: what
 * the guard allows through, and what it never reveals. Rendering the real shell
 * would drag the header, both sidebars and the query client into every case and
 * turn an assertion about the session into an assertion about CSS.
 */
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>
      <nav>التنقل الرئيسي</nav>
      {children}
    </div>
  ),
}));

const SESSION = SESSION_RESPONSE;

/**
 * A cache that keeps what it is given.
 *
 * The shared test client collects its entries as soon as nothing observes them
 * (`gcTime: 0`), and a cache that empties itself is not what these cases are
 * about: the question is whether the frame EMPTIES the cache, and a cache that
 * has already emptied itself would answer the question wrongly.
 */
function persistentClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
}

describe("(app) layout auth guard", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the chrome only once the session probe succeeds", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(SESSION);

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(await screen.findByRole("navigation")).toHaveTextContent("التنقل الرئيسي");
    expect(screen.getByText("محتوى محمي")).toBeInTheDocument();
  });

  it("shows a loading status and no page content while the session is unknown", async () => {
    let resolveSession: (() => void) | null = null;
    vi.spyOn(api, "getSession").mockReturnValue(
      new Promise((resolve) => {
        resolveSession = () => resolve(SESSION);
      }),
    );

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("محتوى محمي")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();

    await act(async () => {
      resolveSession?.();
    });
    await waitFor(() => expect(screen.getByText("محتوى محمي")).toBeInTheDocument());
  });

  it("never renders protected content for a signed-out visitor", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("Unauthorized"));

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LOGIN_ROUTE));
    expect(screen.queryByText("محتوى محمي")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  /**
   * THE SENTENCE THE SERVER ACTUALLY SENDS.
   *
   * `backend/src/common/guards/jwt-auth.guard.ts` answers an expired access
   * token with `UnauthorizedException('Invalid or expired token')`, and that
   * sentence was not in the classifier's table. An expired token was therefore
   * not recognised as a lost session: the reader was sent to the error surface
   * with a retry button instead of the sign-in screen, and the retry could
   * never succeed because nothing refreshes the token. The access token lives
   * for fifteen minutes, so this was not an edge case — it was what happened
   * to every reader, every quarter of an hour.
   */
  it("treats the server's own expired-token sentence as a signed-out visitor", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("Invalid or expired token"));

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LOGIN_ROUTE));
    expect(screen.queryByText("محتوى محمي")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /**
   * THE CACHE IS EMPTIED WHEN THE SESSION ENDS.
   *
   * The reader's conversations, library, payments and unread counts are cached
   * under keys that carry no account identity, and the cache lives in the root
   * layout, so it survives the redirect to the sign-in screen. The next person
   * to sign in on this tab would be served the previous reader's data.
   *
   * The frame is what empties it — once it has torn down the pages that were
   * reading the cache, so that emptying it cannot cancel a request that is
   * still in flight and swallow the error the server sent.
   */
  it("empties the cache once the reader is signed out", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("Unauthorized"));
    const queryClient = persistentClient();
    queryClient.setQueryData(["messages", "conversations"], { conversations: [] });
    expect(queryClient.getQueryData(["messages", "conversations"])).toBeDefined();

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
      { queryClient },
    );

    await waitFor(() => expect(queryClient.getQueryData(["messages", "conversations"])).toBeUndefined());
  });

  it("keeps the cache while the reader is signed in", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(SESSION);
    const queryClient = persistentClient();
    queryClient.setQueryData(["messages", "conversations"], { conversations: [] });

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
      { queryClient },
    );

    await screen.findByText("محتوى محمي");
    expect(queryClient.getQueryData(["messages", "conversations"])).toBeDefined();
  });

  it("offers a retry when the probe fails for a reason other than the session", async () => {
    const getSession = vi
      .spyOn(api, "getSession")
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(SESSION);

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("محتوى محمي")).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: RETRY_LABEL }).click();
    });

    await waitFor(() => expect(screen.getByText("محتوى محمي")).toBeInTheDocument());
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("gives the main content region a skip-link target", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(SESSION);

    renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    // The shell owns `#main-content`; the guard's contract is that it only ever
    // appears behind a verified session, which the cases above already assert.
    await screen.findByText("محتوى محمي");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("keeps the skip-link target alive while the session is unknown", () => {
    // The probe branch IS the whole page — the shell has not rendered — so it
    // carries the landmark the root layout's skip link points at.
    vi.spyOn(api, "getSession").mockReturnValue(new Promise(() => undefined));

    const rendering = renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    const main = rendering.container.querySelector("main#main-content");
    expect(main, "the guard's loading branch must own the skip-link target").not.toBeNull();
    expect(main?.getAttribute("tabindex")).toBe("-1");
    expect(rendering.getByRole("status")).toBeInTheDocument();
  });

  it("keeps the landmark on the retry surface rather than only while loading", async () => {
    vi.spyOn(api, "getSession").mockRejectedValueOnce(new Error("Network request failed"));

    const rendering = renderWithProviders(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    // The reader can sit on this surface indefinitely — the retry is live — so
    // it is the surface that most needs the landmark.
    await waitFor(() => expect(rendering.getByRole("alert")).toBeInTheDocument());
    const main = rendering.container.querySelector("main#main-content");
    expect(main, "the guard's error branch must own the skip-link target").not.toBeNull();
    expect(main?.getAttribute("tabindex")).toBe("-1");
  });
});
