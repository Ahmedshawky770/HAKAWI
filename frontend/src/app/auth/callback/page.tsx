"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setStoredUser } from "@/lib/api";
import { AUTHENTICATED_HOME_ROUTE, LOGIN_ROUTE } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completeOAuth = async () => {
      try {
        const session = await api.getSession();

        if (typeof window !== "undefined") {
          setStoredUser(session.user);
        }

        router.replace(AUTHENTICATED_HOME_ROUTE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل إكمال تسجيل الدخول");
      }
    };

    completeOAuth();
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="sr-only">إكمال تسجيل الدخول</h1>

        {error ? (
          <>
            <ErrorMessage error={error} title="فشل إكمال تسجيل الدخول" />
            <ButtonLink href={LOGIN_ROUTE} block className="mt-5">
              العودة لتسجيل الدخول
            </ButtonLink>
          </>
        ) : (
          <Loading text="جاري إكمال تسجيل الدخول..." />
        )}
      </div>
    </div>
  );
}