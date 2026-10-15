"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { messageOnlySchema } from "@/lib/schemas";
import { LOGIN_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorMessage, SuccessMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function ResetPasswordPage() {
  const router = useRouter();
  const strings = useStrings();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const getToken = (): string => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(strings.auth.passwordsMismatch);
      return;
    }

    const token = getToken();
    if (!token) {
      setError(strings.auth.resetTokenInvalid);
      return;
    }

    setLoading(true);

    try {
      await api.request(messageOnlySchema, "/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
      setTimeout(() => {
        router.push(LOGIN_ROUTE);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.resetError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={strings.auth.resetTitle}
      description={strings.auth.resetDescription}
      footer={
        <Link href={LOGIN_ROUTE} className="font-medium text-chrome-ink hover:text-chrome-hover">
          {strings.auth.resetBackToLogin}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        {success ? (
          <SuccessMessage title={strings.auth.resetSuccessTitle}>{strings.auth.resetSuccessText}</SuccessMessage>
        ) : (
          <>
            <Input
              label={strings.auth.resetNewPasswordLabel}
              type="password"
              required
              autoComplete="new-password"
              hint={strings.auth.passwordHint}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={strings.auth.passwordPlaceholder}
            />
            <Input
              label={strings.auth.resetConfirmPasswordLabel}
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={strings.auth.confirmPasswordPlaceholder}
            />
            <Button type="submit" loading={loading} block>
              {strings.auth.resetButton}
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}