"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { readerMessage } from "@/lib/errors";
import { AUTHENTICATED_HOME_ROUTE, LOGIN_ROUTE } from "@/lib/routes";
import { startSession } from "@/lib/session";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function AuthCallbackPage() {
  const router = useRouter();
  const strings = useStrings();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // The completion effect must run exactly once. `strings` changes object
  // identity when the locale flips from the server's default to the reader's
  // stored one right after hydration, so the effect keys on the router alone
  // and reads the latest copy through a ref kept in step by the effect below.
  const stringsRef = useRef(strings);

  useEffect(() => {
    stringsRef.current = strings;
  }, [strings]);

  useEffect(() => {
    const completeOAuth = async () => {
      try {
        const session = await api.getSession();

        if (typeof window !== "undefined") {
          // The OAuth handshake is a sign-in like any other: the cache belongs
          // to the session that filled it, and the reader may have had one
          // before they signed in with a provider.
          startSession(queryClient, session.user);
        }

        router.replace(AUTHENTICATED_HOME_ROUTE);
      } catch (err) {
        // The server's wording is a fact about the API, in English, inside an
        // interface that may be Arabic — so the failure is classified and said
        // in the reader's language.
        setError(readerMessage(err, stringsRef.current.errors, stringsRef.current.auth.callbackError));
      }
    };

    completeOAuth();
  }, [router, queryClient]);

  // WHY A `<main>` LANDMARK HERE: the root layout's skip link targets
  // `#main-content`, and this route is neither `AppShell`'s frame nor an
  // `AuthShell` page — it is the OAuth landing, which redirects on success and
  // shows its own error surface on failure. Both states need a landmark, and
  // `tabIndex={-1}` is what makes the skip link's focus move land somewhere. The
  // shape is `AuthShell`'s, minus the card the shell adds.
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-6"
    >
      <div className="w-full max-w-md">
        <h1 className="sr-only">{strings.auth.callbackTitle}</h1>

        {error ? (
          <>
            <ErrorMessage error={error} title={strings.auth.callbackErrorTitle} />
            <ButtonLink href={LOGIN_ROUTE} block className="mt-5">
              {strings.auth.callbackBackToLogin}
            </ButtonLink>
          </>
        ) : (
          <Loading text={strings.auth.callbackLoading} />
        )}
      </div>
    </main>
  );
}