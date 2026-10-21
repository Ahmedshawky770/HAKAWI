"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { MfaChallengeDialog } from "@/components/auth/MfaChallengeDialog";
import { useStrings } from "@/components/providers/LocaleProvider";
import { registerMfaCodeRequester } from "@/lib/mfa-step-up";
import { api } from "@/lib/api";

/**
 * THE SECOND FACTOR, AND WHO ASKS FOR IT.
 *
 * THE API CLIENT ASKS; THIS PROVIDER ANSWERS. The client is a plain module with no React
 * in it, so it cannot show a dialog — it asks whoever has registered a requester, and the
 * requester is this provider. The reader is asked for a code, the code is checked against
 * the API, and the code is handed back so the request that was refused can be made again.
 *
 * WHY THE CODE IS CHECKED BEFORE IT IS USED. The client would send any code the reader
 * typed, and the API would refuse a wrong one — but the reader would then be told "that
 * code is not right" by the retry, with no idea which attempt failed. Checking it first
 * means the reader is told the code was wrong while the dialog is still open, where they
 * can type another one.
 *
 * WHY THE CODE IS NOT STORED. It lives in this provider's state, it goes to the API in
 * the `X-MFA-Token` header, and it is forgotten when the request is made. There is no
 * localStorage copy, no cookie, and no "remember this device": a second factor that
 * outlives the action it authorised is not a second factor.
 */
export function MfaProvider({ children }: { children: ReactNode }) {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<((code: string | null) => void) | null>(null);

  useEffect(() => {
    registerMfaCodeRequester(async () => {
      setError(null);
      setOpen(true);
      return new Promise<string | null>((resolve) => {
        resolverRef.current = resolve;
      });
    });
    return () => {
      registerMfaCodeRequester(null);
      // A reader who is asked for a code and then leaves the page must not leave a
      // request waiting for ever: the pending request is answered with "no code",
      // and the action fails as a refusal rather than hanging.
      resolverRef.current?.(null);
      resolverRef.current = null;
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setPending(false);
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const submit = useCallback(
    async (code: string) => {
      setPending(true);
      setError(null);
      try {
        await api.verifyMfaChallenge(code);
        setOpen(false);
        setPending(false);
        resolverRef.current?.(code);
        resolverRef.current = null;
      } catch {
        // The code was refused. The reader is told so HERE, while the dialog is
        // still open and they can type another one — rather than by the retry,
        // which would arrive as a failure of the action they were trying to do.
        setPending(false);
        setError(strings.auth.mfaInvalidCode);
      }
    },
    [strings.auth.mfaInvalidCode],
  );

  return (
    <>
      {children}
      <MfaChallengeDialog open={open} onSubmit={submit} onClose={close} error={error ?? undefined} pending={pending} />
    </>
  );
}
