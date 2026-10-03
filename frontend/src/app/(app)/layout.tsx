"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import {
  AUTH_GUARD_ERROR_MESSAGE,
  AUTH_GUARD_LOADING_TEXT,
  AUTH_GUARD_RETRY_LABEL,
  useAuthGuard,
} from "@/lib/auth-guard";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const { status, retry } = useAuthGuard();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading size="lg" text={AUTH_GUARD_LOADING_TEXT} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <ErrorMessage error={AUTH_GUARD_ERROR_MESSAGE} onRetry={retry} />
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
        >
          {AUTH_GUARD_RETRY_LABEL}
        </button>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
