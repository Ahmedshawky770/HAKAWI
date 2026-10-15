"use client";

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
