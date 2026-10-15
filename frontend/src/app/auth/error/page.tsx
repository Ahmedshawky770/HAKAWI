"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { LOGIN_ROUTE } from "@/lib/routes";
import { useStrings } from "@/components/providers/LocaleProvider";

function AuthErrorContent() {
  const strings = useStrings();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error") || "";
  const errorMessages: Record<string, string> = {
    access_denied: strings.auth.authErrorAccessDenied,
    missing_code: strings.auth.authErrorMissingCode,
    oauth_failed: strings.auth.authErrorOauthFailed,
    invalid_request: strings.auth.authErrorInvalidRequest,
  };
  const error = errorMessages[errorParam] || `${strings.auth.errorUnknownPrefix}${errorParam || strings.auth.errorUnknown}`;

  return (
    <AuthShell title={strings.auth.errorPageTitle}>
      <ErrorMessage error={error} title={strings.auth.errorReasonTitle} />
      <ButtonLink href={LOGIN_ROUTE} block className="mt-5">
        {strings.auth.authErrorBackToLogin}
      </ButtonLink>
    </AuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}