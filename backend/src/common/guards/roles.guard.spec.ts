import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  REQUIRED_ADMIN_ROLE_KEY,
  REQUIRED_ROLES_KEY,
} from '../decorators/roles.decorator.ts';
import {
  AccountType,
  AdminRole,
  accountTypeAtLeast,
  adminRoleAtLeast,
  normalizeAccountType,
  normalizeAdminRole,
} from '../constants/roles.ts';
import { Permission } from '../permissions/permissions.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import { RolesGuard } from './roles.guard.ts';

interface GuardScenario {
  isPublic?: boolean;
  roles?: readonly AccountType[];
  requiredAdminRole?: AdminRole;
  permissions?: readonly Permission[];
  user?: Partial<JwtPayload> | null;
}

const createUser = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'user@example.com',
  accountType: AccountType.READER,
  ...overrides,
});

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
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
    if (scenario.roles !== undefined) {
      apply(REQUIRED_ROLES_KEY, scenario.roles);
    }
    if (scenario.requiredAdminRole !== undefined) {
      apply(REQUIRED_ADMIN_ROLE_KEY, scenario.requiredAdminRole);
    }
    if (scenario.permissions !== undefined) {
      apply(PERMISSIONS_KEY, scenario.permissions);
    }

    const request = { user: scenario.user === undefined ? createUser() : scenario.user } as unknown as AuthRequest;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
  };

  describe('public routes', () => {
    it('allows any caller when the route is public', () => {
      const context = buildContext({ isPublic: true, user: null });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a public route even when roles are required', () => {
      const context = buildContext({
        isPublic: true,
        roles: [AccountType.ADMIN],
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser(),
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('missing metadata', () => {
    it('allows access when no roles or admin role metadata is present', () => {
      expect(guard.canActivate(buildContext({ user: createUser() }))).toBe(true);
    });

    it('allows access when the required roles array is empty', () => {
      expect(guard.canActivate(buildContext({ roles: [], user: createUser() }))).toBe(true);
    });

    it('allows an anonymous caller when no metadata is present', () => {
      expect(guard.canActivate(buildContext({ user: null }))).toBe(true);
    });

    it('ignores permission metadata, which belongs to the permissions guard', () => {
      const context = buildContext({ permissions: [Permission.STATS_VIEW], user: null });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('account type checks', () => {
    it('allows a caller whose account type is required', () => {
      const context = buildContext({
        roles: [AccountType.WRITER],
        user: createUser({ accountType: AccountType.WRITER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a caller whose account type implies a required account type', () => {
      const context = buildContext({
        roles: [AccountType.READER],
        user: createUser({ accountType: AccountType.ADMIN }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies a caller whose account type is not required', () => {
      const context = buildContext({
        roles: [AccountType.ADMIN],
        user: createUser({ accountType: AccountType.READER }),
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('denies a writer attempting an admin only route', () => {
      const context = buildContext({
        roles: [AccountType.ADMIN],
        user: createUser({ accountType: AccountType.WRITER }),
      });
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('accepts any of several required account types', () => {
      const context = buildContext({
        roles: [AccountType.WRITER, AccountType.ADMIN],
        user: createUser({ accountType: AccountType.WRITER }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('normalizes the legacy author account type to writer', () => {
      const context = buildContext({ roles: [AccountType.WRITER], user: createUser({ accountType: 'author' }) });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies an unknown account type against an admin only route', () => {
      const context = buildContext({ roles: [AccountType.ADMIN], user: createUser({ accountType: 'wizard' }) });
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('denies a caller with a missing account type', () => {
      const context = buildContext({
        roles: [AccountType.ADMIN],
        user: { sub: 'user-1', email: 'user@example.com' },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });
  });

  describe('admin role checks', () => {
    it('allows a caller holding the exact required admin role', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.CONTENT_MODERATOR,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a super admin to satisfy a content moderator requirement', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.CONTENT_MODERATOR,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows a super admin to satisfy a super admin requirement', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('denies a content moderator on a super admin route', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient admin privileges');
    });

    it('denies sibling admin roles from each other', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.FINANCIAL_OFFICER,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.VERIFICATION_OFFICER }),
      });
      expect(() => guard.canActivate(context)).toThrow('Insufficient admin privileges');
    });

    it('denies a caller with an admin account type but no admin role', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser({ accountType: AccountType.ADMIN }),
      });
      expect(() => guard.canActivate(context)).toThrow('Insufficient admin privileges');
    });

    it('denies a caller holding an unknown admin role', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: 'wizard' }),
      });
      expect(() => guard.canActivate(context)).toThrow('Insufficient admin privileges');
    });

    it('normalizes the legacy moderator admin role', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.CONTENT_MODERATOR,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: 'moderator' }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('enforces both the account type and the admin role when both are required', () => {
      const allowed = buildContext({
        roles: [AccountType.ADMIN],
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      expect(guard.canActivate(allowed)).toBe(true);

      const denied = buildContext({
        roles: [AccountType.ADMIN],
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(() => guard.canActivate(denied)).toThrow('Insufficient admin privileges');
    });

    it('allows an admin role requirement without any account type requirement', () => {
      const context = buildContext({
        requiredAdminRole: AdminRole.CONTENT_MODERATOR,
        user: createUser({ accountType: AccountType.READER, adminRole: AdminRole.CONTENT_MODERATOR }),
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('missing caller', () => {
    it('denies a missing user when roles are required', () => {
      const context = buildContext({ roles: [AccountType.ADMIN], user: null });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });

    it('denies a missing user when an admin role is required', () => {
      const context = buildContext({ requiredAdminRole: AdminRole.SUPER_ADMIN, user: null });
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });
  });

  describe('hierarchy helpers', () => {
    it('treats admin as implying every account type', () => {
      for (const accountType of [AccountType.READER, AccountType.WRITER, AccountType.ADMIN]) {
        expect(accountTypeAtLeast(AccountType.ADMIN, accountType)).toBe(true);
      }
    });

    it('does not let a reader satisfy a writer requirement', () => {
      expect(accountTypeAtLeast(AccountType.READER, AccountType.WRITER)).toBe(false);
    });

    it('does not let non admin account types satisfy the admin requirement', () => {
      expect(accountTypeAtLeast(AccountType.PUBLISHER, AccountType.ADMIN)).toBe(false);
    });

    it('keeps rising star, professional and publisher peers of writer', () => {
      expect(accountTypeAtLeast(AccountType.RISING_STAR, AccountType.WRITER)).toBe(true);
      expect(accountTypeAtLeast(AccountType.PROFESSIONAL, AccountType.RISING_STAR)).toBe(false);
      expect(accountTypeAtLeast(AccountType.PUBLISHER, AccountType.PROFESSIONAL)).toBe(false);
    });

    it('lets super admin satisfy every admin role', () => {
      for (const required of [
        AdminRole.SUPER_ADMIN,
        AdminRole.CONTENT_MODERATOR,
        AdminRole.FINANCIAL_OFFICER,
        AdminRole.VERIFICATION_OFFICER,
      ]) {
        expect(adminRoleAtLeast(AdminRole.SUPER_ADMIN, required)).toBe(true);
      }
    });

    it('does not let an officer satisfy a super admin requirement', () => {
      for (const role of [AdminRole.CONTENT_MODERATOR, AdminRole.FINANCIAL_OFFICER, AdminRole.VERIFICATION_OFFICER]) {
        expect(adminRoleAtLeast(role, AdminRole.SUPER_ADMIN)).toBe(false);
      }
    });
  });

  describe('normalization helpers', () => {
    it('maps the legacy author account type to writer', () => {
      expect(normalizeAccountType('author')).toBe(AccountType.WRITER);
    });

    it('passes documented account types through unchanged', () => {
      for (const accountType of [
        AccountType.READER,
        AccountType.WRITER,
        AccountType.RISING_STAR,
        AccountType.PROFESSIONAL,
        AccountType.PUBLISHER,
        AccountType.ADMIN,
      ]) {
        expect(normalizeAccountType(accountType)).toBe(accountType);
      }
    });

    it('falls back to the least privileged account type for unknown values', () => {
      expect(normalizeAccountType('wizard')).toBe(AccountType.READER);
      expect(normalizeAccountType('')).toBe(AccountType.READER);
    });

    it('normalizes case and surrounding whitespace', () => {
      expect(normalizeAccountType('  Writer ')).toBe(AccountType.WRITER);
    });

    it('maps legacy admin roles onto the documented values', () => {
      expect(normalizeAdminRole('moderator')).toBe(AdminRole.CONTENT_MODERATOR);
      expect(normalizeAdminRole('finance')).toBe(AdminRole.FINANCIAL_OFFICER);
    });

    it('returns undefined for an unknown admin role', () => {
      expect(normalizeAdminRole('wizard')).toBeUndefined();
      expect(normalizeAdminRole('')).toBeUndefined();
    });
  });
});
