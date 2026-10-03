import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY, PERMISSIONS_KEY, RequireAnyPermission } from '../decorators/roles.decorator.ts';
import { AccountType, AdminRole } from '../constants/roles.ts';
import { Permission } from '../permissions/permissions.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import { createOwnershipGuard, OwnershipGuard } from './ownership.guard.ts';
import type { OwnershipResolver } from './ownership.guard.ts';

interface GuardScenario {
  isPublic?: boolean;
  /** Written as the pre-mode bare array, which is how most of this spec's cases are expressed. */
  permissions?: readonly Permission[];
  user?: Partial<JwtPayload> | null;
}

const createUser = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'user@example.com',
  accountType: AccountType.READER,
  ...overrides,
});

describe('OwnershipGuard', () => {
  let reflector: Reflector;
  let resolveOwnerId: Mock<OwnershipResolver['resolveOwnerId']>;

  beforeEach(() => {
    reflector = new Reflector();
    resolveOwnerId = vi.fn<OwnershipResolver['resolveOwnerId']>();
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

    const request = { user: scenario.user === undefined ? createUser() : scenario.user } as unknown as AuthRequest;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
  };

  const buildResolver = (): OwnershipResolver => ({
    resolveOwnerId: (request) => Promise.resolve(resolveOwnerId(request)),
  });

  describe('ownership', () => {
    it('allows the resource owner', async () => {
      resolveOwnerId.mockResolvedValue('user-1');
      const guard = createOwnershipGuard(reflector, buildResolver());

      await expect(guard.canActivate(buildContext({ user: createUser() }))).resolves.toBe(true);
    });

    it('denies a caller that is not the owner', async () => {
      resolveOwnerId.mockResolvedValue('user-2');
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ user: createUser() });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('You do not own this resource');
    });

    it('denies when the resolver cannot determine an owner', async () => {
      resolveOwnerId.mockResolvedValue(null);
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ user: createUser() });
      await expect(guard.canActivate(context)).rejects.toThrow('You do not own this resource');
    });

    it('denies when the resolver throws', async () => {
      resolveOwnerId.mockRejectedValue(new Error('database unavailable'));
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ user: createUser() });
      await expect(guard.canActivate(context)).rejects.toThrow('Ownership could not be verified');
    });

    it('denies a missing user', async () => {
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ user: null });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Access denied');
    });

    it('supports a synchronous resolver', async () => {
      const guard = createOwnershipGuard(reflector, { resolveOwnerId: () => 'user-1' });
      await expect(guard.canActivate(buildContext({ user: createUser() }))).resolves.toBe(true);
    });

    it('uses a custom denial message', async () => {
      const guard = createOwnershipGuard(reflector, { resolveOwnerId: () => 'user-2' }, { message: 'Not your story' });
      await expect(guard.canActivate(buildContext({ user: createUser() }))).rejects.toThrow('Not your story');
    });
  });

  describe('scope awareness', () => {
    it('enforces ownership for an own scoped permission', async () => {
      resolveOwnerId.mockResolvedValue('user-1');
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ permissions: [Permission.STORIES_EDIT_OWN], user: createUser() });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('stays out of the way when no own scoped permission is required', async () => {
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ permissions: [Permission.REPORTS_VIEW], user: createUser() });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolveOwnerId).not.toHaveBeenCalled();
    });

    it('stays out of the way on a public route', async () => {
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({ isPublic: true, user: createUser() });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(resolveOwnerId).not.toHaveBeenCalled();
    });

    /**
     * `OwnershipGuard` reads the requirement through the same normaliser as `PermissionsGuard`, so it
     * cannot drift into reading a different shape. These cases pin that the mode on the requirement
     * does not change *whether* ownership is demanded — only `PermissionsGuard` evaluates the mode —
     * and that the pre-mode bare array still means "own-scoped permissions apply".
     */
    describe('reading the permission requirement', () => {
      const contextForAnyMode = (): ExecutionContext => {
        class Probe {
          @RequireAnyPermission(Permission.STORIES_EDIT_OWN, Permission.STORIES_EDIT_ALL)
          handler(): void {
            return undefined;
          }
        }

        const request = { user: createUser() } as unknown as AuthRequest;
        return {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => Probe.prototype.handler,
          getClass: () => Probe,
        } as unknown as ExecutionContext;
      };

      it('enforces ownership under the explicit any mode when one option is own scoped', async () => {
        resolveOwnerId.mockResolvedValue('user-2');
        const guard = createOwnershipGuard(reflector, buildResolver());

        await expect(guard.canActivate(contextForAnyMode())).rejects.toThrow('You do not own this resource');
      });

      it('still stays out of the way when no option in an any mode requirement is own scoped', async () => {
        class Probe {
          @RequireAnyPermission(Permission.REPORTS_VIEW, Permission.STATS_VIEW)
          handler(): void {
            return undefined;
          }
        }

        const request = { user: createUser() } as unknown as AuthRequest;
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => Probe.prototype.handler,
          getClass: () => Probe,
        } as unknown as ExecutionContext;

        const guard = createOwnershipGuard(reflector, buildResolver());
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(resolveOwnerId).not.toHaveBeenCalled();
      });

      it('reads a bare array as the default all mode rather than as the old any mode', async () => {
        // The bare array is how pre-mode metadata is written. Reading it as OR here would let a
        // legacy list quietly downgrade an ownership requirement.
        resolveOwnerId.mockResolvedValue('user-2');
        const guard = createOwnershipGuard(reflector, buildResolver());

        const context = buildContext({ permissions: [Permission.STORIES_EDIT_OWN], user: createUser() });
        await expect(guard.canActivate(context)).rejects.toThrow('You do not own this resource');
      });

      it('refuses to evaluate malformed requirement metadata', async () => {
        const handler = class TestHandler {};
        Reflect.defineMetadata(PERMISSIONS_KEY, { permissions: 'stories:edit:own' }, handler);

        const request = { user: createUser() } as unknown as AuthRequest;
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => handler,
          getClass: () => class TestController {},
        } as unknown as ExecutionContext;

        const guard = createOwnershipGuard(reflector, buildResolver());
        await expect(guard.canActivate(context)).rejects.toThrow(/Malformed permission requirement metadata/);
      });
    });
  });

  describe('super admin bypass', () => {
    it('allows a super admin to act on another user resource', async () => {
      resolveOwnerId.mockResolvedValue('user-2');
      const guard = createOwnershipGuard(reflector, buildResolver());

      const context = buildContext({
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('can be disabled so that even a super admin must own the resource', async () => {
      resolveOwnerId.mockResolvedValue('user-2');
      const guard = createOwnershipGuard(reflector, buildResolver(), { allowSuperAdmin: false });

      const context = buildContext({
        user: createUser({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN }),
      });
      await expect(guard.canActivate(context)).rejects.toThrow('You do not own this resource');
    });
  });

  /**
   * The guard used to be defined here and referenced only by this spec: it was absent
   * from `CommonModule`, so `@UseGuards(OwnershipGuard)` could not resolve and nothing
   * in the application ever enforced ownership. These cases pin the property that makes
   * the wiring safe to trust.
   */
  describe('fail closed when ownership cannot be established', () => {
    const ownScopedContext = (): ExecutionContext =>
      buildContext({ permissions: [Permission.STORIES_EDIT_OWN], user: createUser() });

    it('denies when no resolver is registered at all', async () => {
      // A guard that returns `true` here is indistinguishable from having no guard, which
      // is the "false assurance" this class of wiring bug creates.
      const guard = new OwnershipGuard(reflector);

      await expect(guard.canActivate(ownScopedContext())).rejects.toThrow('Ownership could not be verified');
    });

    it('denies when the resolver cannot determine an owner', async () => {
      resolveOwnerId.mockResolvedValue(null);
      const guard = createOwnershipGuard(reflector, buildResolver());

      await expect(guard.canActivate(ownScopedContext())).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ownScopedContext())).rejects.toThrow('You do not own this resource');
    });

    it('denies when the resolver throws', async () => {
      resolveOwnerId.mockRejectedValue(new Error('valkey unavailable'));
      const guard = createOwnershipGuard(reflector, buildResolver());

      await expect(guard.canActivate(ownScopedContext())).rejects.toThrow('Ownership could not be verified');
    });

    it('denies an authenticated caller whose subject is empty', async () => {
      const guard = createOwnershipGuard(reflector, buildResolver());
      const context = buildContext({
        permissions: [Permission.STORIES_EDIT_OWN],
        user: { ...createUser(), sub: '' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow('Access denied');
    });

    it('still stays out of the way on a route with no own-scoped permission', async () => {
      const guard = new OwnershipGuard(reflector);
      const context = buildContext({ permissions: [Permission.REPORTS_VIEW], user: createUser() });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('accepts the injected options object as the third constructor argument', async () => {
      resolveOwnerId.mockResolvedValue('user-2');
      const guard = new OwnershipGuard(reflector, buildResolver(), { message: 'Not your story' });

      await expect(guard.canActivate(ownScopedContext())).rejects.toThrow('Not your story');
    });
  });
});
