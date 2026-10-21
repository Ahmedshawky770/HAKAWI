"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { MfaProvider } from "@/components/providers/MfaProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { onSessionLost } from "@/lib/session-events";
import { clearUnobservedQueries } from "@/lib/session";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            // A mutation that fails on the first attempt is usually a real
            // failure, not a blip: the optimistic UI has already reverted by
            // the time this runs, so retrying silently would fight the reader.
            retry: 0,
          },
        },
      }),
  );

  /*
   * THE CACHE BELONGS TO THE SESSION THAT FILLED IT.
   *
   * The cache holds every conversation, library entry, payment and unread count
   * the reader fetched — under keys that carry no account identity, because the
   * fact being cached is "this reader's conversations" and the reader is
   * whoever is signed in. It lives in this component, in the root layout, so
   * it survives a redirect to the sign-in screen.
   *
   * It is emptied at the three moments a session can end, and at NO other
   * moment:
   *
   *   · the reader signs out — `components/layout/LogoutButton.tsx`;
   *   · the reader signs in, or signs up, in a tab that already had a session
   *     — `lib/session.ts`, used by the sign-in and registration screens;
   *   · the session ends by itself — an expired token, a revoked session, a
   *     remote sign-out. The API client announces that (`lib/api.ts`), this
   *     component owns the cache and so empties what nobody is waiting for,
   *     and the authenticated frame empties the rest once it has torn down the
   *     pages that were reading it (`app/(app)/layout.tsx`).
   *
   * WHY THE SECOND ONE IS NOT DONE HERE, AT THE MOMENT THE 401 ARRIVES. The
   * obvious place to empty a cache is the moment the server answers
   * "unauthorized" — and doing that from inside the response handler is a
   * trap. Emptying the cache DESTROYS the queries, and destroying a query
   * whose request is still in flight CANCELS that request: the error the
   * server sent never reaches the component waiting for it, and that component
   * sits in the loading state for ever, with no error, no retry. The header
   * fetches an unread count on every route, so one expired token froze every
   * page of the product.
   *
   * So this component empties only the queries NOBODY is waiting for. A query
   * that is still being watched is left alone, and the frame that owns the
   * pages reading it empties it once those pages are gone.
   *
   * And this component listens where the redirect cannot unlisten it: it lives
   * in the ROOT layout, above the route tree, so a navigation to the sign-in
   * screen does not take the listener with it. That is the whole reason the
   * cache is emptied from two places: the frame's clear is the one that runs
   * after the teardown, and this one is the one that always runs.
   */
  useEffect(() => {
    return onSessionLost(() => {
      clearUnobservedQueries(client);
    });
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LocaleProvider>
          {/* The second factor, asked for at the moment an action needs it. It sits
              INSIDE the providers, so it is mounted wherever the action happens —
              including on a page that is not under the authenticated frame. */}
          <MfaProvider>
            <ToastProvider>{children}</ToastProvider>
          </MfaProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
