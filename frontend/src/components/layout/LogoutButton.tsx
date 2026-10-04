"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { api, clearStoredUser, getStoredRefreshToken } from "@/lib/api";
import { LOGOUT_REDIRECT_ROUTE } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Signing out clears two things, and both of them matter.
 *
 * The local session is cleared directly. The query cache is cleared too: it holds
 * every story, conversation and profile this reader just fetched, and the next
 * reader of a shared machine would otherwise see the previous one's feed for as
 * long as the cache lived.
 */
export function LogoutButton() {
  const router = useRouter();
  const strings = useStrings();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    await api.logout(getStoredRefreshToken() ?? undefined).catch(() => null);
    clearStoredUser();
    queryClient.clear();
    setPending(false);
    router.push(LOGOUT_REDIRECT_ROUTE);
  };

  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      loading={pending}
      onClick={handleLogout}
      data-testid="logout-button"
    >
      {!pending && <Icon name="logout" size="sm" />}
      {strings.signOut}
    </Button>
  );
}
