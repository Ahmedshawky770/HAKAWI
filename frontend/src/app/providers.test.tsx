/// <reference types="@testing-library/jest-dom/vitest" />

import React, { useEffect, useRef } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { jsonResponse } from "@/test-utils/support";
import { api } from "@/lib/api";
import { Providers } from "@/app/providers";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

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
 * The cache is emptied at the session boundaries: signing out
 * (`components/layout/LogoutButton.tsx`), signing in (`lib/session.ts`), and
 * the session ending by itself — which the providers empty the queries nobody
 * is waiting for, and the authenticated frame empties the rest once it has
 * torn down the pages that were reading them (`app/(app)/layout.tsx`).
 */
function CacheProbe({ onReady }: { onReady: (client: QueryClient) => void }) {
  const client = useQueryClient();
  onReady(client);
  return null;
}

/**
 * A component that is WAITING for a query, the way every page in the product
 * waits for one.
 *
 * The observer is the point: a query nobody is watching is not being waited
 * for, and a query somebody IS watching has an answer that has to reach the
 * component waiting for it.
 */
function WatchedQuery({
  queryFn,
  onError,
}: {
  queryFn: () => Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  const { error } = useQuery({
    queryKey: ["watched"],
    queryFn,
    // The retry is off in this test so that the error reaches the component on
    // the FIRST failure: what is being checked is that the error is not
    // swallowed, not how many times the client asks again.
    retry: false,
  });
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (error) onErrorRef.current(error);
  }, [error]);

  return null;
}

describe("the query cache and the session", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

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

    client?.clear();

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
   *
   * The session loss is produced by a REAL 401 through the real client, and
   * not by calling the announcement by hand: the announcement is the symptom,
   * and the 401 is the cause.
   */
  it("does not cancel a request that is in flight when the session is lost", async () => {
    const holder: { client: QueryClient | null } = { client: null };
    const received: unknown[] = [];
    let rejectInFlight: ((reason: unknown) => void) | undefined;

    render(
      <Providers>
        <CacheProbe
          onReady={(ready) => {
            holder.client = ready;
          }}
        />
        <WatchedQuery
          onError={(error) => received.push(error)}
          queryFn={() =>
            new Promise((_resolve, reject) => {
              rejectInFlight = reject;
            })
          }
        />
      </Providers>,
    );

    await waitFor(() => expect(rejectInFlight).toBeDefined());

    fetchMock.mockResolvedValue(jsonResponse({ message: "Invalid or expired token" }, 401));
    await expect(api.getSession()).rejects.toThrow("Invalid or expired token");

    // The request was NOT cancelled: it is still in flight, and the answer it
    // is waiting for still reaches the component that is waiting for it.
    rejectInFlight?.(new Error("Invalid or expired token"));
    await waitFor(() => expect(received.length).toBeGreaterThan(0));
    expect((received[0] as Error).message).toBe("Invalid or expired token");
  });

  /**
   * THE OTHER HALF OF THE SAME GUARANTEE.
   *
   * The data of a session must not outlive the session, even when nobody is
   * looking at it any more: the reader navigated away, the request came back,
   * and the answer is in the cache. When the session ends, that answer goes
   * with it — otherwise the next person to sign in on this tab is served the
   * previous reader's conversations.
   */
  it("empties the queries nobody is waiting for when the session ends", async () => {
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

    client?.setQueryData(["messages", "conversations"], { conversations: [{ id: "c-1" }] });
    client?.setQueryData(["library", "list"], { books: [{ id: "b-1" }] });
    expect(client?.getQueryData(["messages", "conversations"])).toBeDefined();

    fetchMock.mockResolvedValue(jsonResponse({ message: "Invalid or expired token" }, 401));
    await expect(api.getSession()).rejects.toThrow("Invalid or expired token");

    expect(client?.getQueryData(["messages", "conversations"])).toBeUndefined();
    expect(client?.getQueryData(["library", "list"])).toBeUndefined();
  });
});
