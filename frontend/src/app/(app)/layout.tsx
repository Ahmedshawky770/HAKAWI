"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import {
  AUTH_GUARD_ERROR_MESSAGE,
  AUTH_GUARD_LOADING_TEXT,
  AUTH_GUARD_RETRY_LABEL,
  useAuthGuard,
} from "@/lib/auth-guard";

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
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const { status, retry } = useAuthGuard();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Loading size="lg" text={AUTH_GUARD_LOADING_TEXT} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-md">
          <ErrorMessage
            error={AUTH_GUARD_ERROR_MESSAGE}
            onRetry={retry}
            retryLabel={AUTH_GUARD_RETRY_LABEL}
          />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
