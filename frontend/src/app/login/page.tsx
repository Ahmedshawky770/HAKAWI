"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiError, classifySignInError, isAppErrorCode } from "@/lib/errors";
import { isCaptchaProvider, type CaptchaProvider } from "@/lib/captcha";
import { SESSION_REASON_PARAM } from "@/lib/auth-guard";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { startSession } from "@/lib/session";
import { AuthShell } from "@/components/auth/AuthShell";
import { CaptchaField } from "@/components/auth/CaptchaField";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * Nothing to subscribe to: the reason is in the URL, and the URL does not
 * change while the reader is on this screen.
 */
const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * THE REASON, READ FROM THE URL.
 *
 * WHY THE REASON ARRIVES IN THE URL. The session guard sends the reader here
 * when the session ends, and it knows WHY: "Account has been disabled" is a
 * fact the reader must be told, because signing in again with the same
 * credentials fails the same way. The reason travels as a CODE in the query
 * string, never as the server's sentence, and it is translated here into the
 * reader's language.
 *
 * WHY IT IS READ THROUGH THE STORE AND NOT DURING THE RENDER. The URL is a
 * BROWSER fact: the server has no query string to read, so a value taken from
 * it during the render would be one thing on the server and another in the
 * browser — the mismatch React refuses to merge, and the reader would see a
 * frame of the wrong screen. `useSyncExternalStore` is the way to read a
 * value that does not exist on the server: the server is given the empty
 * string, and the client is given the code in the URL. React hydrates the
 * server's answer and reads the store again straight after.
 */
function useSessionReason(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => new URLSearchParams(window.location.search).get(SESSION_REASON_PARAM) ?? "",
    () => "",
  );
}

export default function LoginPage() {
  const router = useRouter();
  const strings = useStrings();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  // THE VERIFICATION THE SERVER ASKED FOR.
  //
  // The server refuses a sign-in that is under a watch with a 401 and a body naming the
  // provider and the site key. Both are facts about the deployment, and both are needed
  // to draw the widget — so they are read from the refusal and kept until the sign-in
  // goes through.
  const [captcha, setCaptcha] = useState<{ provider: CaptchaProvider; siteKey: string } | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const reason = useSessionReason();
  // The reason is what the reader is told ON ARRIVAL. The first thing they
  // do after it is try to sign in, and from then on what they are told is
  // what that attempt produced.
  const error =
    !attempted && isAppErrorCode(reason) ? strings.errors[reason] : submitError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setSubmitError("");
    setLoading(true);

    try {
      await api.login({ email, password, captchaToken });
      const session = await api.getSession();
      // The cache belongs to the session that filled it. A sign-in can follow
      // a previous session in the same tab — the reader reached the login
      // screen without signing out — and the cache would still hold that
      // reader's conversations, library and payments. They are emptied here,
      // the same way an explicit sign-out empties them.
      startSession(queryClient, session.user);
      router.push(AUTHENTICATED_HOME_ROUTE);
    } catch (err) {
      // The server's own wording ("Invalid email or password") is a fact about
      // the API, not about the reader, and it arrives in English inside an
      // Arabic interface. The error is CLASSIFIED and then said in the
      // reader's language — see `lib/errors.ts`.
      //
      // AND IT IS CLASSIFIED AS A SIGN-IN, NOT AS A FAILURE IN GENERAL. A 401
      // on this screen means one thing only: the email and the password did
      // not match. The same status on a protected page means the opposite —
      // the session ended — and the generic classifier would otherwise have
      // told a reader whose password was wrong that "your session has ended",
      // which is a sentence about a session they never had.
      setSubmitError(strings.errors[classifySignInError(err)]);

      // THE SERVER ASKED FOR A VERIFICATION.
      //
      // It says so in the refusal, and it names the provider and the site key. The
      // reader is told that a verification is needed AND the verification is drawn —
      // because a reader who is told "a verification is required" and shown nothing is
      // told to do something they cannot do.
      if (err instanceof ApiError && err.captchaRequired) {
        if (isCaptchaProvider(err.captchaProvider) && err.captchaSiteKey) {
          setCaptcha({ provider: err.captchaProvider, siteKey: err.captchaSiteKey });
          setCaptchaToken(null);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={strings.auth.loginTitle}
      footer={
        <>
          {strings.auth.loginFooter}{" "}
          <Link href="/register" className="font-medium text-chrome-ink hover:text-chrome-hover">
            {strings.auth.loginCreateAccountLink}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        <Input
          label={strings.auth.emailLabel}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={strings.auth.emailPlaceholder}
        />
        <Input
          label={strings.auth.passwordLabel}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={strings.auth.passwordPlaceholder}
        />

        {captcha && (
          <CaptchaField
            provider={captcha.provider}
            siteKey={captcha.siteKey}
            onToken={(token) => setCaptchaToken(token)}
          />
        )}

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-chrome-ink hover:text-chrome-hover">
            {strings.auth.loginForgotPasswordLink}
          </Link>
        </div>

        <Button type="submit" loading={loading} block>
          {strings.auth.loginButton}
        </Button>
      </form>

      <OAuthButtons />
    </AuthShell>
  );
}