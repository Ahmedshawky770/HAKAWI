import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  RequireAllPermissions,
  RequireAnyPermission,
  RequirePermissions,
} from '../decorators/roles.decorator.ts';
import { AccountType, AdminRole, isSuperAdmin } from '../constants/roles.ts';
import { Permission } from '../permissions/permissions.ts';
import type { PermissionRequirement } from '../types/permission-requirement.types.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import { PermissionsGuard } from './permissions.guard.ts';

interface GuardScenario {
  isPublic?: boolean;
  /** Raw `PERMISSIONS_KEY` metadata as a bare array — the shape the decorators used to write. */
  permissions?: readonly Permission[];
  /** A requirement built by a real decorator, i.e. with an explicit mode. */
  requirement?: PermissionRequirement;
  user?: Partial<JwtPayload> | null;
}

const createUser = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'user@example.com',
  accountType: AccountType.READER,
  ...overrides,
});

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  const buildContext = (scenario: GuardScenario): ExecutionContext => {
    const handler = class TestHandler {};
    const controller = class TestController {};

    const apply = (key: string, value: unknown): void => {
      Reflect.defineMetadata(key, value, handler);
      Reflect.defineMetadata(key, value, controller);
    };

    if (scenario.isPublic === true) {
      apply(IS_PUBLIC_KEY, true);
    }
    if (scenario.permissions !== undefined) {
      apply(PERMISSIONS_KEY, scenario.permissions);
    }
    if (scenario.requirement !== undefined) {
      apply(PERMISSIONS_KEY, scenario.requirement);
    }

    const request = { user: scenario.user === undefined ? createUser() : scenario.user } as unknown as AuthRequest;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
  };

  /**
   * Builds a context around a handler that a real decorator has already been applied to.
   *
   * Each mode test declares its own probe class with decorator syntax, so the metadata the guard
   * reads is byte-for-byte what the decorator writes. A requirement assembled by hand inside the
   * scenario would test the guard against a shape no call site can produce, and would keep passing
   * if the decorators changed.
   */
  const contextFor = (owner: object, handler: () => void, scenario: GuardScenario): ExecutionContext => {
    const request = { user: scenario.user === undefined ? createUser() : scenario.user } as unknown as AuthRequest;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => owner,
    } as unknown as ExecutionContext;
  };

  describe('additive safety', () => {
    it('allows access when no permission metadata is present', () => {
      expect(guard.canActivate(buildContext({ user: createUser() }))).toBe(true);
    });

    it('allows access when the required permission array is empty', () => {
      expect(guard.canActivate(buildContext({ permissions: [], user: createUser() }))).toBe(true);
    });

    it('allows an anonymous caller when no permission metadata is present', () => {
      expect(guard.canActivate(buildContext({ user: null }))).toBe(true);
    });

    it('allows any caller on a public route', () => {
      const context = buildContext({ isPublic: true, permissions: [Permission.STATS_VIEW], user: null });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('granted permissions', () => {
    it('allows a reader to create a report', () => {
      const context = buildContext({
        permissions: [Permission.REPORTS_CREATE],
        user: createUser({ accountType: AccountType.READER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a writer to create a story', () => {
      const context = buildContext({
        permissions: [Permission.STORIES_CREATE],
        user: createUser({ accountType: AccountType.WRITER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a content moderator to view reports', () => {
      const context = buildContext({
        permissions: [Permission.REPORTS_VIEW],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a content moderator to take moderation actions', () => {
      const context = buildContext({
        permissions: [Permission.ACTIONS_CREATE],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a financial officer to manage financial records', () => {
      const context = buildContext({
        permissions: [Permission.FINANCIAL_MANAGE_ALL],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.FINANCIAL_OFFICER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a verification officer to verify users', () => {
      const context = buildContext({
        permissions: [Permission.USERS_VERIFY_ALL],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.VERIFICATION_OFFICER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('requires every listed permission by default, not just one of them', () => {
      // The defect this pins: `hasPermission` used to be `required.some(...)`, so a WRITER — who
      // holds CONTENT_EDIT_OWN but not CONTENT_EDIT_ALL — satisfied a route that asked for both.
      const context = buildContext({
        permissions: [Permission.CONTENT_EDIT_OWN, Permission.CONTENT_EDIT_ALL],
        user: createUser({ accountType: AccountType.WRITER }),
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        `Missing required permission: ${Permission.CONTENT_EDIT_OWN} and ${Permission.CONTENT_EDIT_ALL}`,
      );
    });

    it('allows access when every listed permission is granted', () => {
      const context = buildContext({
        permissions: [Permission.CONTENT_EDIT_OWN, Permission.CONTENT_EDIT_ALL],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    /**
     * The mode has to be chosen by the caller, and the choice has to survive the trip through
     * metadata. These cases drive the real decorators — `RequireAllPermissions`, `RequireAnyPermission`
     * and the retained `RequirePermissions` — so they exercise the shape the decorators actually
     * write, not a requirement assembled by the test.
     */
    describe('requirement mode', () => {
      const writer = (): Partial<JwtPayload> => ({ accountType: AccountType.WRITER });
      const financialOfficer = (): Partial<JwtPayload> => ({
        accountType: AccountType.ADMIN,
        adminRole: AdminRole.FINANCIAL_OFFICER,
      });
      const contentModerator = (): Partial<JwtPayload> => ({
        accountType: AccountType.ADMIN,
        adminRole: AdminRole.CONTENT_MODERATOR,
      });

      it('RequireAllPermissions denies a caller who holds only the first of two', () => {
        class Probe {
          @RequireAllPermissions(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        const context = contextFor(Probe, new Probe().handler, { user: createUser(writer()) });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => guard.canActivate(context)).toThrow(
          `Missing required permission: ${Permission.USERS_MANAGE_ALL} and ${Permission.FINANCIAL_MANAGE_ALL}`,
        );
      });

      it('RequireAllPermissions allows a caller who holds both', () => {
        class Probe {
          @RequireAllPermissions(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        const context = contextFor(Probe, new Probe().handler, {
          user: createUser({ accountType: AccountType.ADMIN }),
        });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('RequireAnyPermission accepts the first permission alone', () => {
        class Probe {
          @RequireAnyPermission(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        const context = contextFor(Probe, new Probe().handler, { user: createUser(financialOfficer()) });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('RequireAnyPermission accepts the second permission alone', () => {
        class Probe {
          @RequireAnyPermission(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        const context = contextFor(Probe, new Probe().handler, { user: createUser(contentModerator()) });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('RequireAnyPermission still denies a caller who holds neither', () => {
        class Probe {
          @RequireAnyPermission(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        const context = contextFor(Probe, new Probe().handler, { user: createUser(writer()) });

        expect(() => guard.canActivate(context)).toThrow(
          `Missing required permission: ${Permission.USERS_MANAGE_ALL} or ${Permission.FINANCIAL_MANAGE_ALL}`,
        );
      });

      it('RequireAnyPermission says "or" in the denial and RequireAllPermissions says "and"', () => {
        // An error message that misreports the rule it applied sends the reader to the wrong place.
        class AnyProbe {
          @RequireAnyPermission(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }
        class AllProbe {
          @RequireAllPermissions(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        const anyContext = contextFor(AnyProbe, new AnyProbe().handler, { user: createUser(writer()) });
        const allContext = contextFor(AllProbe, new AllProbe().handler, { user: createUser(writer()) });

        expect(() => guard.canActivate(anyContext)).toThrow(/ or /);
        expect(() => guard.canActivate(allContext)).toThrow(/ and /);
      });

      it('RequirePermissions keeps working for a single permission and stays in the default mode', () => {
        class SingleProbe {
          @RequirePermissions(Permission.STORIES_CREATE)
          handler(): void {
            return undefined;
          }
        }
        class PairProbe {
          @RequirePermissions(Permission.USERS_MANAGE_ALL, Permission.FINANCIAL_MANAGE_ALL)
          handler(): void {
            return undefined;
          }
        }

        expect(
          guard.canActivate(contextFor(SingleProbe, new SingleProbe().handler, { user: createUser(writer()) })),
        ).toBe(true);

        // Two arguments through the retained shorthand must be AND, not the old `.some()`.
        const pair = contextFor(PairProbe, new PairProbe().handler, { user: createUser(writer()) });
        expect(() => guard.canActivate(pair)).toThrow(/ and /);
      });

      it('refuses to evaluate malformed metadata instead of treating it as no requirement', () => {
        // Failing open here is the "looks protected, protects nothing" trap: an unreadable
        // requirement must never become an allow.
        const context = buildContext({
          requirement: { permissions: 'stats:view' } as unknown as PermissionRequirement,
        });

        expect(() => guard.canActivate(context)).toThrow(/Malformed permission requirement metadata/);
      });

      it('refuses a requirement whose mode is not one of the two named modes', () => {
        const context = buildContext({
          requirement: { permissions: [Permission.STATS_VIEW], mode: 'some' } as unknown as PermissionRequirement,
        });

        expect(() => guard.canActivate(context)).toThrow(/Malformed permission requirement metadata/);
      });
    });

    it('normalizes the legacy author account type before resolving permissions', () => {
      const context = buildContext({
        permissions: [Permission.STORIES_CREATE],
        user: createUser({ accountType: 'author' }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('denied permissions', () => {
    it('denies a reader attempting to view reports', () => {
      const context = buildContext({
        permissions: [Permission.REPORTS_VIEW],
        user: createUser({ accountType: AccountType.READER }),
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(`Missing required permission: ${Permission.REPORTS_VIEW}`);
    });

    it('denies a reader attempting to read platform stats', () => {
      const context = buildContext({
        permissions: [Permission.STATS_VIEW],
        user: createUser({ accountType: AccountType.READER }),
      });
      expect(() => guard.canActivate(context)).toThrow('Missing required permission: stats:view');
    });

    it('denies a financial officer without the admin account type from moderating content', () => {
      const context = buildContext({
        permissions: [Permission.CONTENT_MODERATE],
        user: createUser({ accountType: AccountType.WRITER, adminRole: AdminRole.FINANCIAL_OFFICER }),
      });
      expect(() => guard.canActivate(context)).toThrow('Missing required permission: content:moderate');
    });

    it('denies a verification officer without the admin account type from managing finances', () => {
      const context = buildContext({
        permissions: [Permission.FINANCIAL_MANAGE_ALL],
        user: createUser({ accountType: AccountType.WRITER, adminRole: AdminRole.VERIFICATION_OFFICER }),
      });
      expect(() => guard.canActivate(context)).toThrow('Missing required permission: financial:manage:all');
    });

    it('does not treat an admin typed officer as a super admin', () => {
      expect(isSuperAdmin(AccountType.ADMIN, AdminRole.FINANCIAL_OFFICER)).toBe(false);
      expect(isSuperAdmin(AccountType.WRITER, AdminRole.SUPER_ADMIN)).toBe(false);
      expect(isSuperAdmin(AccountType.ADMIN, AdminRole.SUPER_ADMIN)).toBe(true);
    });

    it('denies a caller holding an unknown account type', () => {
      const context = buildContext({
        permissions: [Permission.STATS_VIEW],
        user: createUser({ accountType: 'wizard' }),
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies a caller with no account type at all', () => {
      const context = buildContext({
        permissions: [Permission.REPORTS_CREATE],
        user: { sub: 'user-1', email: 'user@example.com' },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies a missing user', () => {
      const context = buildContext({ permissions: [Permission.REPORTS_VIEW], user: null });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });
  });

  describe('super admin', () => {
    it('allows a super admin to read platform stats', () => {
      const context = buildContext({
        permissions: [Permission.STATS_VIEW],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a super admin to perform any permission gated action', () => {
      const context = buildContext({
        permissions: [Permission.SETTINGS_MANAGE, Permission.FINANCIAL_MANAGE_ALL],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('treats a plain admin account type as fully privileged', () => {
      const context = buildContext({
        permissions: [Permission.SETTINGS_MANAGE],
        user: createUser({ accountType: AccountType.ADMIN }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('grants the documented full access to the admin account type even for officers', () => {
      const context = buildContext({
        permissions: [Permission.SETTINGS_MANAGE, Permission.USERS_VERIFY_ALL],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.FINANCIAL_OFFICER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('normalizes the legacy moderator admin role before resolving permissions', () => {
      const context = buildContext({
        permissions: [Permission.REPORTS_VIEW],
        user: createUser({ accountType: AccountType.ADMIN, adminRole: 'moderator' }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
