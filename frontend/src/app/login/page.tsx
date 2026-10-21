"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api, setStoredUser } from "@/lib/api";
import { classifySignInError } from "@/lib/errors";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function LoginPage() {
  const router = useRouter();
  const strings = useStrings();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login({ email, password });
      const session = await api.getSession();
      setStoredUser(session.user);
      // The cache belongs to the session that filled it. A sign-in can follow
      // a previous session in the same tab — the reader reached the login
      // screen without signing out — and the cache would still hold that
      // reader's conversations, library and payments. They are emptied here,
      // the same way an explicit sign-out empties them.
      queryClient.clear();
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
      setError(strings.errors[classifySignInError(err)]);
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