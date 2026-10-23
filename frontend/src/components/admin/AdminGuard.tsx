"use client";

import React from "react";

import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * THE ADMIN ROLE GUARD.
 *
 * Every admin page wraps its content in this guard. It reads the session from
 * the store and decides, before the page renders, whether the caller may see
 * it:
 *
 * 1. Nobody signed in → the "not an admin" screen.
 * 2. Signed in but `accountType !== "admin"` → the "not an admin" screen.
 * 3. Signed in as admin but `adminRole` is not one of `allowedRoles` → the
 *    "wrong role" screen, naming the role the caller actually holds.
 * 4. Signed in as admin with an allowed role → the page content renders.
 *
 * The check is client-side because the session lives in localStorage and the
 * server cannot read it. A malicious caller who strips the guard from the DOM
 * still hits the backend, where `@Secured(AccountType.ADMIN)` and
 * `@RequireAdminRole(...)` refuse every request the role does not own. The
 * guard is therefore UX, not a security boundary: it keeps a reader out of a
 * screen they cannot use, and the API keeps them out of data they cannot touch.
 */
export function AdminGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly string[];
  children: React.ReactNode;
}) {
  const strings = useStrings();
  const user = useStoredUser();

  /**
   * The caller's admin role, or `null` when they are not an admin account at
   * all. `accountType === "admin"` is the prerequisite; `adminRole` is the
   * specific surface they may enter.
   */
  const isAdminAccount =
    user?.accountType === "admin";
  const adminRole = isAdminAccount ? (user.adminRole ?? null) : null;
  const mayEnter = isAdminAccount && allowedRoles.includes(adminRole ?? "");

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
