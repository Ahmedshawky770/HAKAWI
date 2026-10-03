import type { Permission } from '../permissions/permissions.ts';

/**
 * How a route's `@RequirePermissions(...)` list is satisfied.
 *
 * WHY this is an explicit two-valued mode rather than an implicit list.
 *
 * `hasPermission` used to be `required.some((p) => resolved.has(p))` — ANY/OR — and it was
 * harmless only by accident: no call site passed a second permission, so OR and AND are
 * indistinguishable for a list of length one. The day someone writes
 * `@RequirePermissions(USERS_MANAGE_ALL, FINANCIAL_MANAGE_ALL)` intending "an administrator who
 * may do both", OR silently grants the route to a financial officer alone and to a user
 * administrator alone. That is a privilege escalation that no test fails, because every existing
 * test still holds.
 *
 * The fix cannot be "flip the boolean", because both meanings are legitimate and only the caller
 * knows which one is meant. So the caller has to name it, and the naming is what this type
 * records. `all` is the default because requiring more cannot escalate; `any` is the opt-in that
 * has to be written down, which is also what makes it greppable and reviewable.
 */
export const PERMISSION_REQUIREMENT_MODES = ['all', 'any'] as const;

export type PermissionRequirementMode = (typeof PERMISSION_REQUIREMENT_MODES)[number];

/**
 * The mode a requirement gets when the caller did not name one.
 *
 * `all`, deliberately: an unnamed requirement is the case where the author's intent is unknown,
 * and the safe reading of an unknown conjunction is the stricter one (Principle #15, proactive
 * defense — refuse what you cannot justify granting).
 */
export const PERMISSION_REQUIREMENT_DEFAULT_MODE: PermissionRequirementMode = 'all';

/**
 * A route's permission requirement as it travels through `@RequirePermissions` metadata.
 *
 * WHY an object and not a bare `readonly Permission[]`: the mode has to travel *with* the list.
 * Storing them in one value makes the pair impossible to set apart — a decorator cannot attach an
 * `:own`-scoped list with a mode left behind, and no later refactor can silently reinterpret one
 * half. See `normalizePermissionRequirement` in `permissions/permissions.ts`, which is the single
 * reader both guards go through.
 */
export interface PermissionRequirement {
  /** The permissions the route requires. Never mutated; safe to share between guards. */
  readonly permissions: readonly Permission[];
  /** `'all'` (AND) or `'any'` (OR). There is no third, looser option. */
  readonly mode: PermissionRequirementMode;
}
