"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { messageOnlySchema } from "@/lib/schemas";
import { LOGIN_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorMessage, SuccessMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function ForgotPasswordPage() {
  const strings = useStrings();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.request(messageOnlySchema, "/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.auth.forgotError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={strings.auth.forgotTitle}
      description={strings.auth.forgotDescription}
      footer={
        <Link href={LOGIN_ROUTE} className="font-medium text-chrome-ink hover:text-chrome-hover">
          {strings.auth.forgotBackToLogin}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        {success ? (
          <SuccessMessage title={strings.auth.forgotSuccessTitle}>{strings.auth.forgotSuccessText}</SuccessMessage>
        ) : (
          <>
            <Input
              label={strings.auth.emailLabel}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={strings.auth.emailPlaceholder}
            />
            <Button type="submit" loading={loading} block>
              {strings.auth.forgotButton}
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}