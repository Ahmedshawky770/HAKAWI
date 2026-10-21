"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, clearStoredUser, onSessionLost } from "./api";
import { classifyError } from "./errors";
import { LOGIN_ROUTE } from "./routes";

export type AuthGuardStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthGuardState {
  status: AuthGuardStatus;
  retry: () => void;
}

/**
 * True when the session probe failed because there is no session.
 *
 * The verdict comes from the shared classifier (`lib/errors.ts`) rather than
 * from a list of strings here: the API client now keeps the server's own
 * wording for a 401 — "Invalid or expired token", "No token provided" — and
 * carries the status with it, so a list written against one message would
 * silently stop recognising the others, and a reader with no session would be
 * shown an error screen instead of the login screen.
 */
export function isUnauthenticatedFailure(error: unknown): boolean {
  return classifyError(error) === "sessionExpired";
}

export async function probeSession(): Promise<void> {
  await api.getSession();
}

export function useAuthGuard(): AuthGuardState {
  const router = useRouter();
  const routerRef = useRef(router);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AuthGuardStatus>("loading");

  /**
   * A SESSION THAT ENDS WHILE THE PAGE IS OPEN.
   *
   * The probe below asks the server "is this reader signed in?" once, when the
   * page opens. But a session does not only end when the reader signs out: an
   * access token expires, a session is revoked on the server, a device is
   * signed out of remotely. Every one of those arrives as a 401 on whatever
   * request happened to be running, and without this subscription the reader
   * stays on a page whose every request now fails, looking at error messages
   * instead of being sent to the sign-in screen.
   *
   * The API client announces the loss (see `lib/api.ts`); this is the one
   * place that acts on it. The reader's own data is emptied by the shell that
   * owns it — see `app/(app)/layout.tsx` — because the shell is what decides
   * that the session is over, and it is the only thing that knows when the
   * pages which were showing that data have been torn down.
   */
  useEffect(() => {
    return onSessionLost(() => {
      clearStoredUser();
      setStatus("unauthenticated");
      routerRef.current.replace(LOGIN_ROUTE);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    probeSession()
      .then(() => {
        if (!cancelled) setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthenticatedFailure(error)) {
          clearStoredUser();
          setStatus("unauthenticated");
          routerRef.current.replace(LOGIN_ROUTE);
          return;
        }
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    status,
    retry: () => {
      setStatus("loading");
      setAttempt((current) => current + 1);
    },
  };
}
