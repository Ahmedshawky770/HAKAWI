import { describe, it, expect } from 'vitest';

import { AccountType } from '../constants/roles.ts';
import type { PermissionRequirement } from '../types/permission-requirement.types.ts';

import {
  PERMISSIONS_BY_ACCOUNT_TYPE,
  Permission,
  describePermissionRequirement,
  hasPermission,
  normalizePermissionRequirement,
  resolvePermissions,
} from './permissions.ts';

const requirement = (
  permissions: Permission[],
  mode: PermissionRequirement['mode'] = 'all',
): PermissionRequirement => ({
  permissions,
  mode,
});

describe('hasPermission', () => {
  const writer = resolvePermissions({ accountType: AccountType.WRITER });

  describe("mode 'all' (AND) — the default", () => {
    it('accepts a caller holding every listed permission', () => {
      expect(hasPermission(writer, requirement([Permission.STORIES_CREATE, Permission.STORIES_EDIT_OWN]))).toBe(true);
    });

    it('rejects a caller holding only one of two', () => {
      // The escalation this replaces: `required.some(...)` answered true here, so a writer would
      // have passed a route that demanded `stories:create` AND `stories:delete:all`.
      expect(writer.has(Permission.FINANCIAL_MANAGE_ALL)).toBe(false);
      expect(hasPermission(writer, requirement([Permission.STORIES_CREATE, Permission.FINANCIAL_MANAGE_ALL]))).toBe(
        false,
      );
    });

    it('is satisfied by an empty list, because an empty requirement constrains nothing', () => {
      expect(hasPermission(new Set(), requirement([]))).toBe(true);
    });
  });

  describe("mode 'any' (OR) — the explicit opt-in", () => {
    it('accepts a caller holding the first permission alone', () => {
      expect(
        hasPermission(writer, requirement([Permission.STORIES_CREATE, Permission.FINANCIAL_MANAGE_ALL], 'any')),
      ).toBe(true);
    });

    it('accepts a caller holding the second permission alone', () => {
      expect(
        hasPermission(writer, requirement([Permission.FINANCIAL_MANAGE_ALL, Permission.STORIES_CREATE], 'any')),
      ).toBe(true);
    });

    it('rejects a caller holding neither', () => {
      expect(
        hasPermission(writer, requirement([Permission.FINANCIAL_MANAGE_ALL, Permission.USERS_MANAGE_ALL], 'any')),
      ).toBe(false);
    });
  });

  it('reads the same permission set for the same subject in both modes', () => {
    // Guards against the two branches being derived from different notions of "granted".
    const admin = resolvePermissions({ accountType: AccountType.ADMIN });
    expect(hasPermission(admin, requirement([Permission.FINANCIAL_MANAGE_ALL, Permission.SETTINGS_MANAGE]))).toBe(true);
    expect(
      hasPermission(admin, requirement([Permission.FINANCIAL_MANAGE_ALL, Permission.SETTINGS_MANAGE], 'any')),
    ).toBe(true);
  });
});

describe('describePermissionRequirement', () => {
  it('joins with "and" under the default mode', () => {
    expect(
      describePermissionRequirement(requirement([Permission.STORIES_CREATE, Permission.FINANCIAL_MANAGE_ALL])),
    ).toBe('stories:create and financial:manage:all');
  });

  it('joins with "or" only under the explicit any mode', () => {
    expect(
      describePermissionRequirement(requirement([Permission.STORIES_CREATE, Permission.FINANCIAL_MANAGE_ALL], 'any')),
    ).toBe('stories:create or financial:manage:all');
  });

  it('renders a single permission without a separator', () => {
    expect(describePermissionRequirement(requirement([Permission.STATS_VIEW]))).toBe('stats:view');
    expect(describePermissionRequirement(requirement([Permission.STATS_VIEW], 'any'))).toBe('stats:view');
  });
});

describe('normalizePermissionRequirement', () => {
  it('returns undefined when the route declares no permission requirement', () => {
    expect(normalizePermissionRequirement(undefined)).toBeUndefined();
    expect(normalizePermissionRequirement(null)).toBeUndefined();
  });

  it('reads a requirement written by a decorator as-is', () => {
    expect(normalizePermissionRequirement(requirement([Permission.STATS_VIEW], 'any'))).toEqual({
      permissions: [Permission.STATS_VIEW],
      mode: 'any',
    });
  });

  it('reads the pre-mode bare array as the default all mode, never as any', () => {
    // Backward compatibility has to point at the stricter answer. If stale metadata revived the
    // old `.some()` behaviour, the escalation this file exists to close would return silently.
    expect(normalizePermissionRequirement([Permission.STATS_VIEW, Permission.FINANCIAL_MANAGE_ALL])).toEqual({
      permissions: [Permission.STATS_VIEW, Permission.FINANCIAL_MANAGE_ALL],
      mode: 'all',
    });
  });

  it('defaults a requirement with no mode to all', () => {
    expect(normalizePermissionRequirement({ permissions: [Permission.STATS_VIEW] })).toEqual({
      permissions: [Permission.STATS_VIEW],
      mode: 'all',
    });
  });

  it('throws for metadata that is not a requirement rather than reporting no requirement', () => {
    // Reporting `undefined` here would disable the check and answer 200 — indistinguishable from a
    // route nobody guarded.
    for (const malformed of [
      'stats:view',
      42,
      { permissions: 'stats:view' },
      { permissions: [Permission.STATS_VIEW], mode: 'some' },
      { mode: 'all' },
      true,
    ]) {
      expect(() => normalizePermissionRequirement(malformed)).toThrow(/Malformed permission requirement metadata/);
    }
  });

  it('names the two supported modes in the error, so the fix is greppable', () => {
    expect(() => normalizePermissionRequirement({ permissions: [Permission.STATS_VIEW], mode: 'some' })).toThrow(
      /RequireAllPermissions \/ RequireAnyPermission/,
    );
  });

  it('drops non-string entries rather than evaluating them, which denies rather than grants', () => {
    const normalized = normalizePermissionRequirement({
      permissions: [Permission.STATS_VIEW, 7, null],
      mode: 'all',
    });
    expect(normalized?.permissions).toEqual([Permission.STATS_VIEW]);
  });
});

describe('the permission table the modes are evaluated against', () => {
  it('holds writers back from the platform-wide permissions a conjunction would name', () => {
    // Stated as a table property rather than a guard test so the reason the AND default matters is
    // legible on its own: the two permission families in a two-permission requirement are usually
    // one a writer has and one it never can.
    const writer: ReadonlySet<Permission> = new Set(PERMISSIONS_BY_ACCOUNT_TYPE[AccountType.WRITER]);
    expect(writer.has(Permission.STORIES_CREATE)).toBe(true);
    expect(writer.has(Permission.FINANCIAL_MANAGE_ALL)).toBe(false);
    expect(writer.has(Permission.USERS_MANAGE_ALL)).toBe(false);
  });
});
