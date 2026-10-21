"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setStoredUser } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";

export default function RegisterPage() {
  const router = useRouter();
  const strings = useStrings();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError(strings.auth.passwordsMismatch);
      return;
    }

    setLoading(true);

    try {
      await api.register({
        name: formData.name,
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });
      const session = await api.getSession();
      setStoredUser(session.user);
      router.push(AUTHENTICATED_HOME_ROUTE);
    } catch (err) {
      setError(strings.errors[classifyError(err)]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <AuthShell
      title={strings.auth.registerTitle}
      footer={
        <>
          {strings.auth.registerFooter}{" "}
          <Link href="/login" className="font-medium text-chrome-ink hover:text-chrome-hover">
            {strings.auth.registerLoginLink}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        <Input
          label={strings.auth.nameLabel}
          type="text"
          required
          name="name"
          autoComplete="name"
          value={formData.name}
          onChange={handleChange}
          placeholder={strings.auth.namePlaceholder}
        />
        <Input
          label={strings.auth.usernameLabel}
          type="text"
          required
          name="username"
          autoComplete="username"
          value={formData.username}
          onChange={handleChange}
          placeholder={strings.auth.usernamePlaceholder}
        />
        <Input
          label={strings.auth.emailLabel}
          type="email"
          required
          name="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          placeholder={strings.auth.emailPlaceholder}
        />
        <Input
          label={strings.auth.passwordLabel}
          type="password"
          required
          name="password"
          autoComplete="new-password"
          hint={strings.auth.passwordHint}
          value={formData.password}
          onChange={handleChange}
          placeholder={strings.auth.passwordPlaceholder}
        />
        <Input
          label={strings.auth.confirmPasswordLabel}
          type="password"
          required
          name="confirmPassword"
          autoComplete="new-password"
          value={formData.confirmPassword}
          onChange={handleChange}
          placeholder={strings.auth.confirmPasswordPlaceholder}
        />

        <Button type="submit" loading={loading} block>
          {strings.auth.registerButton}
        </Button>
      </form>

      <OAuthButtons />
    </AuthShell>
  );
}