"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setStoredUser } from "@/lib/api";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function LoginPage() {
  const router = useRouter();
  const strings = useStrings();
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
      router.push(AUTHENTICATED_HOME_ROUTE);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.loginError);
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
    </AuthShell>
  );
}