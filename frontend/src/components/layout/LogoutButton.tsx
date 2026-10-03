"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { api, clearStoredUser, getStoredRefreshToken } from "@/lib/api";
import { LOGOUT_REDIRECT_ROUTE } from "@/lib/routes";
import { Button } from "@/components/ui/Button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    await api.logout(getStoredRefreshToken() ?? undefined).catch(() => null);
    clearStoredUser();
    setPending(false);
    router.push(LOGOUT_REDIRECT_ROUTE);
  };

  return (
    <Button variant="secondary" className="w-full" loading={pending} onClick={handleLogout}>
      تسجيل الخروج
    </Button>
  );
}
