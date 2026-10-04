"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setStoredUser } from "@/lib/api";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { AuthShell } from "@/components/auth/AuthShell";
import { PASSWORD_HINT } from "@/components/auth/copy";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const router = useRouter();
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
      setError("كلمتا المرور غير متطابقتين");
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
      setError(err instanceof Error ? err.message : "فشل إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <AuthShell
      title="إنشاء حساب جديد"
      footer={
        <>
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-medium text-chrome-ink hover:text-chrome-hover">
            تسجيل الدخول
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorMessage error={error} />}

        <Input
          label="الاسم الكامل"
          type="text"
          required
          name="name"
          autoComplete="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="أحمد محمد"
        />
        <Input
          label="اسم المستخدم"
          type="text"
          required
          name="username"
          autoComplete="username"
          value={formData.username}
          onChange={handleChange}
          placeholder="ahmed"
        />
        <Input
          label="البريد الإلكتروني"
          type="email"
          required
          name="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="example@mail.com"
        />
        <Input
          label="كلمة المرور"
          type="password"
          required
          name="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          value={formData.password}
          onChange={handleChange}
          placeholder="••••••••"
        />
        <Input
          label="تأكيد كلمة المرور"
          type="password"
          required
          name="confirmPassword"
          autoComplete="new-password"
          value={formData.confirmPassword}
          onChange={handleChange}
          placeholder="••••••••"
        />

        <Button type="submit" loading={loading} block>
          إنشاء الحساب
        </Button>
      </form>
    </AuthShell>
  );
}