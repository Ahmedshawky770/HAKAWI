"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setStoredUser } from "@/lib/api";
import { AUTHENTICATED_HOME_ROUTE, LOGIN_ROUTE } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function AuthCallbackPage() {
  const router = useRouter();
  const strings = useStrings();
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
          setStoredUser(session.user);
        }

        router.replace(AUTHENTICATED_HOME_ROUTE);
      } catch (err) {
        setError(err instanceof Error ? err.message : stringsRef.current.auth.callbackError);
      }
    };

    completeOAuth();
  }, [router]);

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