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

const SUCCESS_TEXT = "إذا كان هناك حساب بهذا البريد الإلكتروني، فقد أرسلنا رابط إعادة تعيين كلمة المرور.";

export default function ForgotPasswordPage() {
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
      setError(err instanceof Error ? err.message : "فشل إرسال رابط إعادة التعيين");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="استعادة كلمة المرور"
      description="أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين"
      footer={
        <Link href={LOGIN_ROUTE} className="font-medium text-chrome-ink hover:text-chrome-hover">
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        {success ? (
          <SuccessMessage title="تم إرسال الطلب">{SUCCESS_TEXT}</SuccessMessage>
        ) : (
          <>
            <Input
              label="البريد الإلكتروني"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
            />
            <Button type="submit" loading={loading} block>
              إرسال رابط إعادة التعيين
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}