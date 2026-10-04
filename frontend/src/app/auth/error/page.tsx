"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { LOGIN_ROUTE } from "@/lib/routes";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "تم رفض الوصول من قبل مزود المصادقة",
  missing_code: "رمز التفويض مفقود",
  oauth_failed: "فشل عملية تسجيل الدخول عبر OAuth",
  invalid_request: "طلب غير صالح",
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error") || "";
  const error = ERROR_MESSAGES[errorParam] || `خطأ: ${errorParam || "غير معروف"}`;

  return (
    <AuthShell title="خطأ في تسجيل الدخول">
      <ErrorMessage error={error} title="سبب الخطأ" />
      <ButtonLink href={LOGIN_ROUTE} block className="mt-5">
        العودة لتسجيل الدخول
      </ButtonLink>
    </AuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}