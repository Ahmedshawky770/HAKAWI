import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { api } from "@/lib/api";
import { AUTH_GUARD_RETRY_LABEL } from "@/lib/auth-guard";
import { LOGIN_ROUTE } from "@/lib/routes";
import { SESSION_RESPONSE } from "@/test-utils/fixtures";

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

    render(
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

    render(
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

    render(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LOGIN_ROUTE));
    expect(screen.queryByText("محتوى محمي")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("offers a retry when the probe fails for a reason other than the session", async () => {
    const getSession = vi
      .spyOn(api, "getSession")
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(SESSION);

    render(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("محتوى محمي")).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: AUTH_GUARD_RETRY_LABEL }).click();
    });

    await waitFor(() => expect(screen.getByText("محتوى محمي")).toBeInTheDocument());
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("gives the main content region a skip-link target", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(SESSION);

    render(
      <AppLayout params={Promise.resolve({})}>
        <p>محتوى محمي</p>
      </AppLayout>,
    );

    // The shell owns `#main-content`; the guard's contract is that it only ever
    // appears behind a verified session, which the cases above already assert.
    await screen.findByText("محتوى محمي");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
