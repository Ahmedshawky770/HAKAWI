"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { messageOnlySchema } from "@/lib/schemas";
import { AUTHENTICATED_HOME_ROUTE, LOGIN_ROUTE } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <Link
            href={AUTHENTICATED_HOME_ROUTE}
            aria-label="حكاوي - الصفحة الرئيسية"
            className="flex items-center justify-center gap-2 mb-6"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">ح</span>
            </div>
          </Link>
          <h1 className="text-center text-3xl font-extrabold text-gray-900">إعادة تعيين كلمة المرور</h1>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {success ? (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm text-green-800">تم إعادة تعيين كلمة المرور بنجاح! جاري التحويل لتسجيل الدخول...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="كلمة المرور الجديدة"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <Input
                label="تأكيد كلمة المرور الجديدة"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
              <Button type="submit" loading={loading} className="w-full">
                إعادة تعيين كلمة المرور
              </Button>
            </div>
          )}
          <div className="text-center">
            <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              العودة لتسجيل الدخول
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
