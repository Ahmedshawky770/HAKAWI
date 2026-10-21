"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, clearStoredUser } from "./api";
import { onSessionLost } from "./session-events";
import { ApiError, classifyError, endsSession, type AppErrorCode } from "./errors";
import { LOGIN_ROUTE } from "./routes";

export type AuthGuardStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthGuardState {
  status: AuthGuardStatus;
  /**
   * WHY the reader cannot continue, when the server named a reason.
   *
   * `null` means "the session ended and nothing more was said". A code means
   * the server DID say something — "Account has been disabled" — and the
   * reader is told that instead of "your session has ended", which would send
   * them to sign in again with the credentials that were just refused.
   */
  reason: AppErrorCode | null;
  retry: () => void;
}

/**
 * THE REASONS WORTH CARRYING TO THE SIGN-IN SCREEN.
 *
 * The sign-in screen is where a reader who cannot continue lands, so it is
 * where the reason belongs. "Your session has ended" is the default and needs
 * no carrying — the screen already says it. The reasons below are the ones a
 * reader can act on, or must be told, and none of them is improved by
 * sending them to the sign-in screen without an explanation.
 */
const CARRIED_REASONS: readonly AppErrorCode[] = [
  "accountDisabled",
  "accountBanned",
  "emailNotVerified",
  "rateLimited",
  "captchaRequired",
  "forbidden",
];

/** The query parameter the reason travels in. */
export const SESSION_REASON_PARAM = "reason";

/**
 * The sign-in screen, with the reason attached when there is one.
 *
 * The reason is a CODE, never the server's sentence: the screen translates it
 * into the reader's language, exactly like every other error.
 */
export function loginRouteWithReason(reason: AppErrorCode | null): string {
  if (reason === null || !CARRIED_REASONS.includes(reason)) return LOGIN_ROUTE;
  return `${LOGIN_ROUTE}?${SESSION_REASON_PARAM}=${encodeURIComponent(reason)}`;
}

/**
 * True when the session probe failed because there is no session.
 *
 * THE ONE RULE, READ FROM THE ERROR. The verdict is decided by the API client
 * — the only layer that knows whether the request was made with a session or
 * was an attempt to establish one — and it travels on the error as
 * `endsSession`. The guard used to ask the classifier a second time, and the
 * two answers could disagree: the client announced the loss of a session for
 * EVERY 401, while the guard accepted only the failures the classifier called
 * `sessionExpired`. A disabled account — a 401 the server words "Account has
 * been disabled" — was therefore announced as a lost session and then judged
 * not to be one, which showed a retry button that could never succeed AND
 * left the previous reader's data in the cache.
 *
 * AND THE FALLBACK IS ONLY FOR A FAILURE THAT NEVER HAD A VERDICT. An error
 * that did not come from the API client — a plain `Error`, thrown by
 * something else entirely — carries no verdict at all, and the classifier is
 * then the only thing that can say what it was. An error that DOES carry a
 * verdict is never re-judged: the client knew whether the request was using a
 * session, and the guard does not.
 */
export function isUnauthenticatedFailure(error: unknown): boolean {
  if (endsSession(error)) return true;
  if (error instanceof ApiError) return false;
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
  const [reason, setReason] = useState<AppErrorCode | null>(null);

  // The router is refreshed on every render, so the redirect that happens
  // outside React's event handling — a session that ends while a request is in
  // flight — uses the current router and not the one captured on the first
  // render, which is a stale closure that Next.js has no reason to keep
  // valid.
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

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
   * owns it — see `app/(app)/layout.tsx` and `app/providers.tsx` — because the
   * shell is what decides that the session is over, and it is the only thing
   * that knows when the pages which were showing that data have been torn
   * down.
   */
  useEffect(() => {
    return onSessionLost((error) => {
      clearStoredUser();
      // The reason comes from the failure that ended the session, so a reader
      // whose account was blocked mid-session is told THAT rather than being
      // told their session expired — which they cannot fix by signing in
      // again.
      const code = classifyError(error);
      const carried = CARRIED_REASONS.includes(code) ? code : null;
      setReason(carried);
      setStatus("unauthenticated");
      routerRef.current.replace(loginRouteWithReason(carried));
    });
  }, []);

  const fail = useCallback((error: unknown) => {
    if (isUnauthenticatedFailure(error)) {
      clearStoredUser();
      const code = classifyError(error);
      const carried = CARRIED_REASONS.includes(code) ? code : null;
      setReason(carried);
      setStatus("unauthenticated");
      routerRef.current.replace(loginRouteWithReason(carried));
      return;
    }
    setReason(null);
    setStatus("error");
  }, []);

  useEffect(() => {
    let cancelled = false;

    probeSession()
      .then(() => {
        if (!cancelled) setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        fail(error);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, fail]);

  return {
    status,
    reason,
    retry: () => {
      setStatus("loading");
      setReason(null);
      setAttempt((current) => current + 1);
    },
  };
}
