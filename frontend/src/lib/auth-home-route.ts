import { normalizeAdminRole } from "@hakawi/shared-types";

import { AUTHENTICATED_HOME_ROUTE } from "./routes";

export type SessionUserLike = {
  accountType?: string | null;
  adminRole?: string | null;
  onboardingCompleted?: boolean;
};

const ADMIN_HOME_ROUTES: Readonly<Record<string, string>> = {
  super_admin: "/admin",
  content_moderator: "/admin/moderation",
  financial_officer: "/admin/financial",
  verification_officer: "/admin/verification",
};

/**
 * The route a signed-in reader lands on after authentication.
 *
 * Onboarding comes first for any account that has not completed it. Admin
 * accounts that have completed onboarding go straight to the surface they own.
 */
export function getAuthenticatedHomeRoute(user: SessionUserLike | null | undefined): string {
  if (!user) return AUTHENTICATED_HOME_ROUTE;
  if (user.onboardingCompleted === false) return "/onboarding";

  if (user.accountType === "admin") {
    const role = typeof user.adminRole === "string" ? normalizeAdminRole(user.adminRole) : undefined;
    if (role) return ADMIN_HOME_ROUTES[role] ?? "/admin";
  }

  return AUTHENTICATED_HOME_ROUTE;
}
