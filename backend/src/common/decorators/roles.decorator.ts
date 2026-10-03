import { SetMetadata } from '@nestjs/common';

import type { AccountType, AdminRole } from '../constants/roles.ts';
import type { Permission } from '../permissions/permissions.ts';
import type { PermissionRequirement, PermissionRequirementMode } from '../types/permission-requirement.types.ts';
import { PERMISSION_REQUIREMENT_DEFAULT_MODE } from '../types/permission-requirement.types.ts';

export const IS_PUBLIC_KEY = 'isPublic' as const;

export const REQUIRED_ROLES_KEY = 'roles' as const;

export const REQUIRED_ADMIN_ROLE_KEY = 'requiredAdminRole' as const;

export const PERMISSIONS_KEY = 'permissions' as const;

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequireRoles = (...accountTypes: AccountType[]) => SetMetadata(REQUIRED_ROLES_KEY, accountTypes);

export const RequireAdminRole = (role: AdminRole) => SetMetadata(REQUIRED_ADMIN_ROLE_KEY, role);

/**
 * The one place a requirement value is built, so the mode is attached atomically to the list.
 *
 * Keeping the two together is the whole point: a mode stored under its own metadata key could be
 * set on one decorator and forgotten on another, and the route would then be evaluated under a mode
 * nobody chose.
 */
const permissionRequirement = (permissions: Permission[], mode: PermissionRequirementMode): PermissionRequirement => ({
  permissions,
  mode,
});

/**
 * Requires **every** listed permission (AND).
 *
 * Use this for a route whose several permissions are genuinely cumulative — "an administrator who
 * may manage users *and* manage finances". That conjunction is the one where a mistake is a
 * privilege escalation, so it is also the default (see `RequirePermissions`).
 */
export const RequireAllPermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissionRequirement(permissions, 'all'));

/**
 * Requires **at least one** listed permission (OR).
 *
 * The deliberate opt-in. `@RequireAnyPermission(CONTENT_EDIT_OWN, CONTENT_EDIT_ALL)` means "an
 * author may edit their own content, a moderator may edit anyone's" — an alternative, not a
 * conjunction. Reaching for this instead of `RequireAllPermissions` is the decision that can
 * over-grant, so it has to be a name somebody types rather than a default somebody inherits.
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissionRequirement(permissions, 'any'));

/**
 * Requires the listed permissions under the default mode, which is `'all'` (AND).
 *
 * WHY this is kept rather than replaced: every existing single-permission call site — moderation,
 * badges, users — passes exactly one permission, for which AND and OR are the same computation.
 * Renaming them would be churn with no behavioural change. It is spelled this way so the single
 * permission reads as "this one", and so a *second* argument inherits the safe conjunction rather
 * than the old `.some()`.
 *
 * Prefer `RequireAllPermissions` when the list has more than one entry, so that the intent is
 * visible at the call site and a future edit to `'any'` cannot be an invisible change.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissionRequirement(permissions, PERMISSION_REQUIREMENT_DEFAULT_MODE));
