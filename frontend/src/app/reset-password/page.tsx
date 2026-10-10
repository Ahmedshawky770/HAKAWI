"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { messageOnlySchema } from "@/lib/schemas";
import { LOGIN_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { PASSWORD_HINT } from "@/components/auth/copy";
import { Button } from "@/components/ui/Button";
import { ErrorMessage, SuccessMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";

const SUCCESS_TEXT = "تم إعادة تعيين كلمة المرور بنجاح! جاري التحويل لتسجيل الدخول...";

export default function ResetPasswordPage() {
  const router = useRouter();
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
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    const token = getToken();
    if (!token) {
      setError("رابط إعادة التعيين غير صالح");
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
      setError(err instanceof Error ? err.message : "فشل إعادة تعيين كلمة المرور");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="إعادة تعيين كلمة المرور"
      description="اختر كلمة مرور جديدة، وسيتم تسجيلك بها عند الدخول التالي"
      footer={
        <Link href={LOGIN_ROUTE} className="font-medium text-chrome-ink hover:text-chrome-hover">
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        {success ? (
          <SuccessMessage title="تم">{SUCCESS_TEXT}</SuccessMessage>
        ) : (
          <>
            <Input
              label="كلمة المرور الجديدة"
              type="password"
              required
              autoComplete="new-password"
              hint={PASSWORD_HINT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Input
              label="تأكيد كلمة المرور الجديدة"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Button type="submit" loading={loading} block>
              إعادة تعيين كلمة المرور
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}