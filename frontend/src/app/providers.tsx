"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";

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
   * It is emptied at the two moments a session can end, and at NO other moment:
   *
   *   · the reader signs out — `components/layout/LogoutButton.tsx`;
   *   · the session ends by itself — an expired token, a revoked session, a
   *     remote sign-out. The API client announces that (`lib/api.ts`), the
   *     session guard declares the reader signed out (`lib/auth-guard.ts`), and
   *     the authenticated frame empties the cache once it has torn down the
   *     pages that were reading it (`app/(app)/layout.tsx`).
   *
   * WHY THE SECOND ONE IS NOT DONE HERE, AT THE MOMENT THE 401 ARRIVES. The
   * obvious place to empty a cache is the moment the server answers
   * "unauthorized" — and doing that from inside the response handler is a
   * trap. Emptying the cache DESTROYS the queries, and destroying a query
   * whose request is still in flight CANCELS that request: the error the
   * server sent never reaches the component waiting for it, and that component
   * sits in the loading state for ever, with no error and no retry. The header
   * fetches an unread count on every route, so one expired token froze every
   * page of the product.
   *
   * So this component does not listen for the session at all. It owns the
   * cache; the session's owner decides when the session is over, and that is
   * the only moment at which the cache may be emptied.
   */

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LocaleProvider>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
