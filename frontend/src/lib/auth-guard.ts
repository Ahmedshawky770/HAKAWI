"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, clearStoredUser } from "./api";
import { LOGIN_ROUTE } from "./routes";

export const AUTH_GUARD_LOADING_TEXT = "جاري التحقق من الجلسة";
export const AUTH_GUARD_RETRY_LABEL = "إعادة المحاولة";
export const AUTH_GUARD_ERROR_MESSAGE = "تعذر التحقق من حالة الجلسة";

export type AuthGuardStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthGuardState {
  status: AuthGuardStatus;
  retry: () => void;
}

export function isUnauthenticatedFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes("Unauthorized") || message.includes("No token provided");
}

export async function probeSession(): Promise<void> {
  await api.getSession();
}

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
