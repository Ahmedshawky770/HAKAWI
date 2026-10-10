import {
  AccountType,
  AdminRole,
  isAccountType,
  isAdminRole,
  normalizeAccountType,
  normalizeAdminRole,
} from '../constants/roles.ts';
import {
  PERMISSION_REQUIREMENT_DEFAULT_MODE,
  PERMISSION_REQUIREMENT_MODES,
} from '../types/permission-requirement.types.ts';
import type { PermissionRequirement, PermissionRequirementMode } from '../types/permission-requirement.types.ts';

export const PERMISSION_RESOURCES = [
  'content',
  'stories',
  'comments',
  'reactions',
  'messages',
  'follow',
  'profile',
  'users',
  'reports',
  'actions',
  'stats',
  'analytics',
  'settings',
  'contests',
  'books',
  'financial',
  'verification',
  'search',
  'notifications',
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = [
  'read',
  'create',
  'update',
  'edit',
  'delete',
  'manage',
  'moderate',
  'restrict',
  'verify',
  'send',
  'use',
  'view',
  'sell',
  'rent',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_SCOPES = ['own', 'all', 'platform'] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const OWN_PERMISSION_SCOPE_SUFFIX = ':own' as const;

export type PermissionPattern =
  `${PermissionResource}:${PermissionAction}` | `${PermissionResource}:${PermissionAction}:${PermissionScope}`;

export const Permission = {
  CONTENT_READ: 'content:read',
  CONTENT_CREATE: 'content:create',
  CONTENT_EDIT_OWN: 'content:edit:own',
  CONTENT_EDIT_ALL: 'content:edit:all',
  CONTENT_DELETE_OWN: 'content:delete:own',
  CONTENT_DELETE_ALL: 'content:delete:all',
  CONTENT_MODERATE: 'content:moderate',
  STORIES_READ: 'stories:read',
  STORIES_CREATE: 'stories:create',
  STORIES_EDIT_OWN: 'stories:edit:own',
  STORIES_EDIT_ALL: 'stories:edit:all',
  STORIES_DELETE_OWN: 'stories:delete:own',
  STORIES_DELETE_ALL: 'stories:delete:all',
  COMMENTS_READ: 'comments:read',
  COMMENTS_CREATE: 'comments:create',
  COMMENTS_EDIT_OWN: 'comments:edit:own',
  COMMENTS_EDIT_ALL: 'comments:edit:all',
  COMMENTS_DELETE_OWN: 'comments:delete:own',
  COMMENTS_DELETE_ALL: 'comments:delete:all',
  REACTIONS_USE: 'reactions:use',
  MESSAGES_READ: 'messages:read',
  MESSAGES_SEND: 'messages:send',
  FOLLOW_USE: 'follow:use',
  PROFILE_VIEW: 'profile:view',
  PROFILE_EDIT_OWN: 'profile:edit:own',
  USERS_READ: 'users:read',
  USERS_MANAGE_ALL: 'users:manage:all',
  USERS_RESTRICT_ALL: 'users:restrict:all',
  USERS_VERIFY_ALL: 'users:verify:all',
  REPORTS_CREATE: 'reports:create',
  REPORTS_VIEW: 'reports:view',
  REPORTS_UPDATE_ALL: 'reports:update:all',
  REPORTS_DELETE_ALL: 'reports:delete:all',
  ACTIONS_VIEW: 'actions:view',
  ACTIONS_CREATE: 'actions:create',
  STATS_VIEW: 'stats:view',
  ANALYTICS_READ_OWN: 'analytics:read:own',
  SETTINGS_MANAGE: 'settings:manage',
  CONTESTS_CREATE: 'contests:create',
  CONTESTS_MANAGE_OWN: 'contests:manage:own',
  CONTESTS_UPDATE_OWN: 'contests:update:own',
  CONTESTS_DELETE_OWN: 'contests:delete:own',
  BOOKS_READ: 'books:read',
  BOOKS_SELL_OWN: 'books:sell:own',
  BOOKS_RENT_OWN: 'books:rent:own',
  FINANCIAL_READ_ALL: 'financial:read:all',
  FINANCIAL_MANAGE_ALL: 'financial:manage:all',
  VERIFICATION_READ_ALL: 'verification:read:all',
  VERIFICATION_MANAGE_ALL: 'verification:manage:all',
  SEARCH_USE: 'search:use',
  NOTIFICATIONS_READ: 'notifications:read',
} as const satisfies Record<string, PermissionPattern>;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(Object.values(Permission));

const READER_PERMISSIONS = [
  Permission.CONTENT_READ,
  Permission.STORIES_READ,
  Permission.COMMENTS_READ,
  Permission.COMMENTS_CREATE,
  Permission.COMMENTS_EDIT_OWN,
  Permission.COMMENTS_DELETE_OWN,
  Permission.REACTIONS_USE,
  Permission.MESSAGES_READ,
  Permission.MESSAGES_SEND,
  Permission.FOLLOW_USE,
  Permission.PROFILE_VIEW,
  Permission.PROFILE_EDIT_OWN,
  Permission.SEARCH_USE,
  Permission.NOTIFICATIONS_READ,
  Permission.REPORTS_CREATE,
] as const satisfies readonly Permission[];

const WRITER_PERMISSIONS = [
  ...READER_PERMISSIONS,
  Permission.CONTENT_CREATE,
  Permission.CONTENT_EDIT_OWN,
  Permission.CONTENT_DELETE_OWN,
  Permission.STORIES_CREATE,
  Permission.STORIES_EDIT_OWN,
  Permission.STORIES_DELETE_OWN,
] as const satisfies readonly Permission[];

const RISING_STAR_PERMISSIONS = [
  ...WRITER_PERMISSIONS,
  Permission.ANALYTICS_READ_OWN,
] as const satisfies readonly Permission[];

const PROFESSIONAL_PERMISSIONS = [
  ...WRITER_PERMISSIONS,
  Permission.BOOKS_READ,
  Permission.BOOKS_SELL_OWN,
  Permission.BOOKS_RENT_OWN,
] as const satisfies readonly Permission[];

const PUBLISHER_PERMISSIONS = [
  ...WRITER_PERMISSIONS,
  Permission.CONTESTS_CREATE,
  Permission.CONTESTS_MANAGE_OWN,
  Permission.CONTESTS_UPDATE_OWN,
  Permission.CONTESTS_DELETE_OWN,
] as const satisfies readonly Permission[];

export const PERMISSIONS_BY_ACCOUNT_TYPE = {
  [AccountType.READER]: READER_PERMISSIONS,
  [AccountType.WRITER]: WRITER_PERMISSIONS,
  [AccountType.RISING_STAR]: RISING_STAR_PERMISSIONS,
  [AccountType.PROFESSIONAL]: PROFESSIONAL_PERMISSIONS,
  [AccountType.PUBLISHER]: PUBLISHER_PERMISSIONS,
  [AccountType.ADMIN]: ALL_PERMISSIONS,
} as const satisfies Readonly<Record<AccountType, readonly Permission[]>>;

const CONTENT_MODERATOR_PERMISSIONS = [
  Permission.CONTENT_MODERATE,
  Permission.CONTENT_EDIT_ALL,
  Permission.CONTENT_DELETE_ALL,
  Permission.STORIES_EDIT_ALL,
  Permission.STORIES_DELETE_ALL,
  Permission.COMMENTS_EDIT_ALL,
  Permission.COMMENTS_DELETE_ALL,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_UPDATE_ALL,
  Permission.REPORTS_DELETE_ALL,
  Permission.ACTIONS_VIEW,
  Permission.ACTIONS_CREATE,
  Permission.USERS_READ,
  Permission.USERS_RESTRICT_ALL,
] as const satisfies readonly Permission[];

const FINANCIAL_OFFICER_PERMISSIONS = [
  Permission.REPORTS_VIEW,
  Permission.REPORTS_UPDATE_ALL,
  Permission.USERS_READ,
  Permission.FINANCIAL_READ_ALL,
  Permission.FINANCIAL_MANAGE_ALL,
] as const satisfies readonly Permission[];

const VERIFICATION_OFFICER_PERMISSIONS = [
  Permission.REPORTS_VIEW,
  Permission.USERS_READ,
  Permission.USERS_VERIFY_ALL,
  Permission.VERIFICATION_READ_ALL,
  Permission.VERIFICATION_MANAGE_ALL,
] as const satisfies readonly Permission[];

export const PERMISSIONS_BY_ROLE = {
  [AdminRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [AdminRole.CONTENT_MODERATOR]: CONTENT_MODERATOR_PERMISSIONS,
  [AdminRole.FINANCIAL_OFFICER]: FINANCIAL_OFFICER_PERMISSIONS,
  [AdminRole.VERIFICATION_OFFICER]: VERIFICATION_OFFICER_PERMISSIONS,
} as const satisfies Readonly<Record<AdminRole, readonly Permission[]>>;

export const PERMISSIONS_BY_ADMIN_ROLE = PERMISSIONS_BY_ROLE;

export interface PermissionSubject {
  accountType?: string | null;
  adminRole?: string | null;
}

export function resolvePermissions(subject: PermissionSubject): ReadonlySet<Permission> {
  const resolved = new Set<Permission>();

  if (typeof subject.accountType === 'string') {
    const accountType = normalizeAccountType(subject.accountType);
    if (isAccountType(accountType)) {
      for (const permission of PERMISSIONS_BY_ACCOUNT_TYPE[accountType]) {
        resolved.add(permission);
      }
    }
  }

  if (typeof subject.adminRole === 'string') {
    const adminRole = normalizeAdminRole(subject.adminRole);
    if (adminRole !== undefined && isAdminRole(adminRole)) {
      for (const permission of PERMISSIONS_BY_ROLE[adminRole]) {
        resolved.add(permission);
      }
    }
  }

  return resolved;
}

/**
 * Whether a resolved permission set satisfies a route's requirement.
 *
 * `'all'` -> every listed permission is granted (AND). `'any'` -> at least one is granted (OR).
 * Both are correct for some routes; only the caller knows which, which is why the mode is on the
 * requirement rather than assumed here. See `PermissionRequirementMode` for why `'all'` is the
 * default and why the OR behaviour used to be a latent escalation.
 *
 * An empty list is satisfied by an empty set in both modes. That is intentional: a requirement with
 * nothing in it constrains nothing. The guards also return early on an empty list, so this branch
 * is only reachable for a direct caller — and it must not deny there.
 */
export function hasPermission(resolved: ReadonlySet<Permission>, requirement: PermissionRequirement): boolean {
  return requirement.mode === 'any'
    ? requirement.permissions.some((permission) => resolved.has(permission))
    : requirement.permissions.every((permission) => resolved.has(permission));
}

/**
 * Renders a requirement for a human, in the mode it will actually be evaluated in.
 *
 * WHY the separator matters: the old message joined the list with `' or '` unconditionally, so a
 * denial on a two-permission route would have told the caller "missing X or Y" for a check that
 * actually required X *and* Y. An authorization error message that misreports the rule it applied
 * sends the reader looking in the wrong place, so the word is derived from the same `mode` the
 * comparison used rather than being hardcoded.
 */
export function describePermissionRequirement(requirement: PermissionRequirement): string {
  return requirement.permissions.join(requirement.mode === 'any' ? ' or ' : ' and ');
}

const isPermissionRequirementMode = (value: unknown): value is PermissionRequirementMode =>
  typeof value === 'string' && (PERMISSION_REQUIREMENT_MODES as readonly string[]).includes(value);

const malformedRequirement = (received: unknown): Error =>
  // Thrown rather than treated as "no requirement". Metadata only ever comes from a decorator, so a
  // value that is not a requirement is a programming error in *this* codebase, not bad user input:
  // returning `undefined` here would disable a permission check entirely and report it as a quiet
  // 200, which is precisely the "looks protected, protects nothing" failure mode. A 500 that names
  // the shape is diagnosable; a silent allow is not.
  new Error(
    `Malformed permission requirement metadata on a route: expected { permissions: Permission[], mode: 'all' | 'any' }, received ${typeof received} (${JSON.stringify(received)}). Use RequireAllPermissions / RequireAnyPermission from common/decorators/roles.decorator.ts.`,
  );

/**
 * The single reader for `PERMISSIONS_KEY` metadata, used by both `PermissionsGuard` and
 * `OwnershipGuard` so the two can never disagree about what a route requires.
 *
 * WHY `unknown` rather than a typed `getAllAndOverride<PermissionRequirement>`: `Reflector` reads
 * whatever a decorator wrote, and typing the read is an assertion, not a check. Accepting `unknown`
 * and narrowing here is what makes a malformed requirement impossible to pass off as a valid one
 * (Principle #1).
 *
 * Two normalisations, both chosen to fail toward the stricter answer:
 *
 * - **A bare array** (the pre-mode shape, still produced by hand-written metadata in specs) is read
 *   as `{ mode: 'all' }`. Stale metadata therefore gains AND semantics, never OR — the old
 *   escalation cannot survive as a legacy path.
 * - **A requirement with no `mode`** is read as `'all'`, matching `PERMISSION_REQUIREMENT_DEFAULT_MODE`.
 * - **A non-string entry** in an otherwise well-formed list is dropped rather than evaluated, so a
 *   malformed element can only ever remove a requirement, never invent one.
 *
 * Anything else throws, naming the shape it wanted.
 */
export function normalizePermissionRequirement(metadata: unknown): PermissionRequirement | undefined {
  if (metadata === undefined || metadata === null) {
    return undefined;
  }

  if (Array.isArray(metadata)) {
    return {
      permissions: metadata.filter((entry): entry is Permission => typeof entry === 'string'),
      mode: PERMISSION_REQUIREMENT_DEFAULT_MODE,
    };
  }

  if (typeof metadata !== 'object') {
    throw malformedRequirement(metadata);
  }

  const candidate = metadata as { permissions?: unknown; mode?: unknown };
  if (!Array.isArray(candidate.permissions)) {
    throw malformedRequirement(metadata);
  }

  const mode = candidate.mode === undefined ? PERMISSION_REQUIREMENT_DEFAULT_MODE : candidate.mode;
  if (!isPermissionRequirementMode(mode)) {
    throw malformedRequirement(metadata);
  }

  return {
    permissions: candidate.permissions.filter((entry): entry is Permission => typeof entry === 'string'),
    mode,
  };
}
