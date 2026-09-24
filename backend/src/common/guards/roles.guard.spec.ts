import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator';
import { AccountType, AdminRole } from '../constants/roles';
import type { AuthRequest } from '../types/auth-request.interface';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let mockGetAllAndOverride: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetAllAndOverride = vi.fn();
    guard = new RolesGuard({
      getAllAndOverride: mockGetAllAndOverride,
    } as any);
  });

  const createMockContext = (overrides: {
    isPublic?: boolean;
    roles?: AccountType[];
    requiredAdminRole?: AdminRole;
    user?: Partial<AuthRequest['user']> | null;
  } = {}): ExecutionContext => {
    const handlerMetadata: Record<string, unknown> = {};
    const classMetadata: Record<string, unknown> = {};

    if (overrides.isPublic !== undefined) {
      handlerMetadata[IS_PUBLIC_KEY] = overrides.isPublic;
      classMetadata[IS_PUBLIC_KEY] = overrides.isPublic;
    }
    if (overrides.roles !== undefined) {
      handlerMetadata['roles'] = overrides.roles;
      classMetadata['roles'] = overrides.roles;
    }
    if (overrides.requiredAdminRole !== undefined) {
      handlerMetadata['requiredAdminRole'] = overrides.requiredAdminRole;
      classMetadata['requiredAdminRole'] = overrides.requiredAdminRole;
    }

    const defaultUser: AuthRequest['user'] = {
      sub: 'user-1',
      email: 'test@example.com',
      accountType: AccountType.READER,
      adminRole: null,
    };

    const mockRequest: Partial<AuthRequest> = {
      user: overrides.user !== undefined ? overrides.user : defaultUser,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => handlerMetadata,
      getClass: () => classMetadata,
    } as unknown as ExecutionContext;
  };

  const mockMetadata = (isPublic: boolean, roles?: AccountType[], requiredAdminRole?: AdminRole) => {
    mockGetAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === 'roles') return roles;
      if (key === 'requiredAdminRole') return requiredAdminRole;
      return undefined;
    });
  };

  describe('public routes', () => {
    it('should allow access to public routes', () => {
      mockMetadata(true);
      const context = createMockContext({ isPublic: true });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockGetAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [expect.any(Object), expect.any(Object)]);
    });
  });

  describe('no roles required', () => {
    it('should allow access when no roles metadata is set', () => {
      mockMetadata(false, undefined, undefined);
      const context = createMockContext({ isPublic: false, roles: undefined });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      mockMetadata(false, [], undefined);
      const context = createMockContext({ isPublic: false, roles: [] });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('authentication', () => {
    it('should throw ForbiddenException when user is missing', () => {
      mockMetadata(false, [AccountType.ADMIN], undefined);
      const context = createMockContext({ isPublic: false, roles: [AccountType.ADMIN], user: null });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });

    it('should throw ForbiddenException when user accountType is missing', () => {
      mockMetadata(false, [AccountType.ADMIN], undefined);
      const context = createMockContext({
        isPublic: false,
        roles: [AccountType.ADMIN],
        user: {
          sub: 'user-1',
          email: 'test@example.com',
          adminRole: null,
        } as Partial<AuthRequest['user']>,
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });
  });

  describe('admin role checks', () => {
    it('should throw ForbiddenException when required admin role does not match', () => {
      mockMetadata(false, [AccountType.ADMIN], AdminRole.SUPER_ADMIN);
      const context = createMockContext({
        isPublic: false,
        roles: [AccountType.ADMIN],
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: {
          sub: 'user-1',
          email: 'test@example.com',
          accountType: AccountType.ADMIN,
          adminRole: AdminRole.MODERATOR,
        },
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient admin privileges');
    });

    it('should allow access when admin role matches', () => {
      mockMetadata(false, [AccountType.ADMIN], AdminRole.SUPER_ADMIN);
      const context = createMockContext({
        isPublic: false,
        roles: [AccountType.ADMIN],
        requiredAdminRole: AdminRole.SUPER_ADMIN,
        user: {
          sub: 'user-1',
          email: 'test@example.com',
          accountType: AccountType.ADMIN,
          adminRole: AdminRole.SUPER_ADMIN,
        },
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow access when requiredAdminRole is not set', () => {
      mockMetadata(false, [AccountType.ADMIN], undefined);
      const context = createMockContext({
        isPublic: false,
        roles: [AccountType.ADMIN],
        requiredAdminRole: undefined,
        user: {
          sub: 'user-1',
          email: 'test@example.com',
          accountType: AccountType.ADMIN,
          adminRole: AdminRole.MODERATOR,
        },
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('account type checks', () => {
    it('should throw ForbiddenException when account type does not match required roles', () => {
      mockMetadata(false, [AccountType.WRITER], undefined);
      const context = createMockContext({
        isPublic: false,
        roles: [AccountType.WRITER],
        user: {
          sub: 'user-1',
          email: 'test@example.com',
          accountType: AccountType.READER,
          adminRole: null,
        },
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('should allow access when account type matches one of required roles', () => {
      mockMetadata(false, [AccountType.WRITER, AccountType.ADMIN], undefined);
      const context = createMockContext({
        isPublic: false,
        roles: [AccountType.WRITER, AccountType.ADMIN],
        user: {
          sub: 'user-1',
          email: 'test@example.com',
          accountType: AccountType.WRITER,
          adminRole: null,
        },
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
