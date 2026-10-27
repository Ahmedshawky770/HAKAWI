"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useAuthGuard } from "@/lib/auth-guard";

/**
 * The authenticated frame.
 *
 * The guard runs BEFORE the chrome: no header, no navigation and no page content
 * are rendered until the session probe has answered. Rendering the shell first
 * and hiding it afterwards is how a signed-out reader ends up looking at an empty
 * feed for a frame, and how a screenshot of "the app" ends up being a spinner.
 *
 * All three waiting states are inside the design system: a `role="status"`
 * region for the probe, the semantic error surface with a retry for a probe that
 * failed for a reason other than the session, and nothing at all for a
 * signed-out visitor (the guard redirects).
 *
 * The probe and the failure are themselves the whole page — `AppShell` has not
 * rendered yet — so each carries the `<main id="main-content">` landmark the
 * root layout's skip link targets. Without it, the first tab stop on the one
 * screen a reader can sit on indefinitely (the retry surface) goes nowhere, the
 * same defect `AuthShell` closes on the auth routes. The two states are mutually
 * exclusive with `AppShell`'s own `<main>`, so the id is never duplicated. The
 * signed-out branch renders nothing at all, so there is nothing to skip to.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const { status, retry } = useAuthGuard();
  const { auth } = useStrings();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  /**
   * THE CACHE IS EMPTIED WHEN THE SESSION ENDS — AND NOT ONE MOMENT EARLIER.
   *
   * The cache holds every conversation, library entry, payment and unread count
   * the reader fetched, under keys that carry no account identity: the fact
   * being cached is "this reader's conversations", and the reader is whoever is
   * signed in. It lives in the root layout, so it survives the redirect to the
   * sign-in screen — and the next person to sign in on this tab would be served
   * the previous reader's private lists.
   *
   * WHY IT IS EMPTIED HERE AND NOT WHEN THE 401 ARRIVES. The obvious place to
   * empty it is the moment the server answers "unauthorized" — and doing that
   * is a trap: emptying the cache DESTROYS the queries, and destroying a query
   * whose request is still in flight CANCELS that request. The error the server
   * sent would then never reach the component that was waiting for it, and that
   * component would sit in the loading state for ever, on all pages, with no
   * error and no retry. That is not a corner case: the header fetches an
   * unread count on every route, so one expired token froze the whole product.
   *
   * So the cache is emptied HERE, where the session is declared over, and this
   * effect runs AFTER the shell above has been torn down — the signed-out
   * branch renders nothing, which unmounts every page that was reading the
   * cache. Nothing observes those queries any more, so destroying them now
   * cannot swallow an error anybody is waiting for: the requests are simply
   * cancelled, and the data is gone.
   *
   * THE OTHER HALF OF THE GUARANTEE, AND WHY THERE ARE TWO HALVES. The
   * providers (`app/providers.tsx`) empty the queries nobody is waiting for the
   * moment the session is announced lost, because they live in the ROOT layout
   * and a navigation to the sign-in screen cannot take them with it. This
   * effect empties the rest, and it is the one that can, because it runs after
   * the pages reading them are gone. The third boundary is the session's
   * other end: the sign-in and registration screens empty the cache before
   * the next session's first byte (`lib/session.ts`), and signing out empties
   * it too (`components/layout/LogoutButton.tsx`).
   */
  useEffect(() => {
    if (status !== "unauthenticated") return;
    queryClient.clear();
  }, [status, queryClient]);

  if (status === "loading") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-dvh items-center justify-center bg-canvas"
      >
        <Loading size="lg" text={auth.authGuardLoading} />
      </main>
    );
  }

  if (status === "error") {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-dvh items-center justify-center bg-canvas p-4"
      >
        <div className="w-full max-w-md">
          <ErrorMessage
            error={auth.authGuardError}
            onRetry={retry}
            retryLabel={auth.authGuardRetry}
          />
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
