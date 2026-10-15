"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, clearStoredUser } from "./api";
import { LOGIN_ROUTE } from "./routes";

export type AuthGuardStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthGuardState {
  status: AuthGuardStatus;
  retry: () => void;
}

/** True when the session probe failed for a reason other than a bad session. */
export function isUnauthenticatedFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes("Unauthorized") || message.includes("No token provided");
}

export async function probeSession(): Promise<void> {
  await api.getSession();
}

/**
 * The session gate the authenticated layout wraps its chrome in.
 *
 * The strings this guard displays live in `@/lib/i18n/auth.ts` (the
 * `authGuard*` keys), not here: a status verdict is logic and a label is copy,
 * and keeping them apart is what lets the guard surface its labels in English
 * when the shell is toggled without this module re-rendering.
 */
export function useAuthGuard(): AuthGuardState {
  const router = useRouter();
  const routerRef = useRef(router);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AuthGuardStatus>("loading");

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
