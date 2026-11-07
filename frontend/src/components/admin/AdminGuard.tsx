"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { normalizeAdminRole } from "@hakawi/shared-types";

import { getAuthenticatedHomeRoute } from "@/lib/auth-home-route";
import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { useStrings } from "@/components/providers/LocaleProvider";

export function AdminGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly string[];
  children: React.ReactNode;
}) {
  const strings = useStrings();
  const router = useRouter();
  const pathname = usePathname();
  const user = useStoredUser();

  const isAdminAccount = user?.accountType === "admin";
  const normalizedRole = isAdminAccount
    ? normalizeAdminRole(user?.adminRole ?? "")
    : undefined;
  const adminRole = normalizedRole ?? (isAdminAccount ? (user?.adminRole ?? null) : null);
  const mayEnter =
    isAdminAccount && normalizedRole !== undefined && allowedRoles.includes(normalizedRole);
  const homeRoute = getAuthenticatedHomeRoute(user);

  useEffect(() => {
    if (!isAdminAccount) return;
    if (mayEnter) return;
    if (pathname === homeRoute) return;
    router.replace(homeRoute);
  }, [isAdminAccount, mayEnter, pathname, homeRoute, router]);

  if (!isAdminAccount) {
    return (
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.common.hubTitle}
          description={strings.admin.common.notAdmin}
        />
        <ErrorMessage
          title={strings.admin.common.notAdmin}
          error={strings.admin.common.wrongRole}
        />
      </div>
    );
  }

  if (!mayEnter) {
    const roleLabels: Record<string, string> = {
      super_admin: strings.admin.common.roleSuperAdmin,
      content_moderator: strings.admin.common.roleContentModerator,
      financial_officer: strings.admin.common.roleFinancialOfficer,
      verification_officer: strings.admin.common.roleVerificationOfficer,
    };
    const roleLabel = roleLabels[adminRole ?? ""] ?? adminRole ?? "";

    return (
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.common.hubTitle}
          description={strings.admin.common.wrongRole}
        />
        <ErrorMessage
          title={strings.admin.common.wrongRole}
          error={`${roleLabel} — ${strings.admin.common.wrongRole}`}
        />
      </div>
    );
  }

  return <>{children}</>;
}
