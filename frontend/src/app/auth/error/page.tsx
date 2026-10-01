"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">خطأ في تسجيل الدخول</h2>
          <p className="mt-2 text-center text-sm text-gray-600">{error}</p>
        </div>
        <div className="mt-8 space-y-6">
          <Link
            href="/login"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}
