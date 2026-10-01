"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setStoredUser } from "@/lib/api";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completeOAuth = async () => {
      try {
        const session = await api.getSession();

        if (typeof window !== "undefined") {
          setStoredUser(session.user);
        }

        router.replace(AUTHENTICATED_HOME_ROUTE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل إكمال تسجيل الدخول");
      }
    };

    completeOAuth();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full px-4">
          <h1 className="sr-only">إكمال تسجيل الدخول</h1>
          <p role="alert" className="text-center text-red-600">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full px-4">
        <h1 className="sr-only">إكمال تسجيل الدخول</h1>
        <p className="text-center text-gray-600">جاري إكمال تسجيل الدخول...</p>
      </div>
    </div>
  );
}
