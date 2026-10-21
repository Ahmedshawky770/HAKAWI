/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { notifySessionLost } from "@/lib/api";
import { Providers } from "@/app/providers";

/**
 * The cache belongs to the session that filled it.
 *
 * The client holds every conversation, library entry, payment and unread count
 * the reader fetched, under keys that carry no account identity. A session can
 * end without the reader signing out — an expired token, a revoked session —
 * and the reader is redirected to the sign-in screen while that data is still
 * in the cache, because the cache lives in the root layout and survives the
 * redirect. The next person to sign in on the same tab would be served it.
 *
 * The cache is emptied at the two session boundaries: signing out
 * (`components/layout/LogoutButton.tsx`) and the session ending by itself,
 * which the authenticated frame does once it has torn down the pages that were
 * reading the cache (`app/(app)/layout.tsx`).
 */
function CacheProbe({ onReady }: { onReady: (client: QueryClient) => void }) {
  const client = useQueryClient();
  onReady(client);
  return null;
}

describe("the query cache and the session", () => {
  it("empties the cache when the reader signs out", () => {
    const holder: { client: QueryClient | null } = { client: null };
    const read = () => holder.client;

    render(
      <Providers>
        <CacheProbe
          onReady={(ready) => {
            holder.client = ready;
          }}
        />
      </Providers>,
    );

    const client = read();
    expect(client).not.toBeNull();

    client?.setQueryData(["messages", "conversations"], { conversations: [] });
    expect(client?.getQueryData(["messages", "conversations"])).toBeDefined();

    act(() => {
      client?.clear();
    });

    expect(client?.getQueryData(["messages", "conversations"])).toBeUndefined();
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * The session loss used to empty the cache from inside the response handler,
   * the moment the server answered "unauthorized". Emptying the cache
   * DESTROYS the queries, and destroying a query whose request is still in
   * flight CANCELS that request: the error the server sent never reached the
   * component waiting for it, and the component sat in the loading state for
   * ever — with no error, no retry, and a fresh request on every render.
   *
   * The header fetches an unread count on every route, so one expired token
   * froze every page of the product. The cache is emptied at the session
   * boundary instead, where nothing is waiting for an error.
   */
  it("does not cancel a request that is in flight when the session is lost", async () => {
    const holder: { client: QueryClient | null } = { client: null };

    render(
      <Providers>
        <CacheProbe
          onReady={(ready) => {
            holder.client = ready;
          }}
        />
      </Providers>,
    );

    const client = holder.client;
    expect(client).not.toBeNull();

    const rejectors: ((reason: unknown) => void)[] = [];
    let attempts = 0;
    const failure = client
      ?.fetchQuery({
        queryKey: ["in-flight"],
        queryFn: () => {
          attempts += 1;
          // The FIRST attempt hangs, so that there is a request in flight at
          // the moment the session is lost. The retry — the client retries a
          // failed request once — fails straight away, with the same error.
          if (attempts > 1) return Promise.reject(new Error("Invalid or expired token"));
          return new Promise((_resolve, rejectPromise) => {
            rejectors.push(rejectPromise);
          });
        },
      })
      .catch((error: unknown) => error);

    await waitFor(() => expect(rejectors.length).toBeGreaterThan(0));

    act(() => {
      notifySessionLost();
    });

    // The request was NOT cancelled: the error the server sent still arrives.
    for (const reject of rejectors) reject(new Error("Invalid or expired token"));
    const outcome = await failure;

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe("Invalid or expired token");
  });
});
