import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { isSuperAdmin } from '../constants/roles.ts';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators/roles.decorator.ts';
import { OWN_PERMISSION_SCOPE_SUFFIX, normalizePermissionRequirement } from '../permissions/permissions.ts';
import type { Permission } from '../permissions/permissions.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';

export interface OwnershipResolver {
  resolveOwnerId(request: AuthRequest): string | null | Promise<string | null>;
}

export interface OwnershipGuardOptions {
  allowSuperAdmin?: boolean;
  message?: string;
}

/**
 * Injection token for the per-resource owner lookup.
 *
 * `OwnershipGuard` cannot answer "is this caller the owner?" on its own: the owner of
 * a story, a comment, a rental or a contest lives in a different table per resource, so
 * the lookup has to be supplied by whoever owns that resource's service. The token
 * exists so `@UseGuards(OwnershipGuard)` on a route can be satisfied by providing
 * `{ provide: OWNERSHIP_RESOLVER, useExisting: SomeResourceService }` in that
 * resource's module (Principle #7: DI, no service locator).
 */
export const OWNERSHIP_RESOLVER = 'OWNERSHIP_RESOLVER';

/**
 * Optional behavioural overrides for the guard, same rationale as `OWNERSHIP_RESOLVER`.
 */
export const OWNERSHIP_GUARD_OPTIONS = 'OWNERSHIP_GUARD_OPTIONS';

const isOwnScoped = (permission: Permission): boolean => permission.endsWith(OWN_PERMISSION_SCOPE_SUFFIX);

/**
 * IDOR guard: for a route whose `@RequirePermissions(...)` list contains at least one
 * `:own`-scoped permission, the caller must be the owner of the addressed resource.
 *
 * ## Fail-closed, on purpose
 *
 * Two conditions deny access instead of allowing it:
 *
 * 1. **No verified subject.** `request.user` is only populated by `JwtAuthGuard`
 *    (`guards/jwt-auth.guard.ts:39`). Without it there is no identity to compare
 *    against, so the request is refused with a generic 403.
 * 2. **No resolver registered, or the resolver cannot answer.** A missing or throwing
 *    `OwnershipResolver` denies with `Ownership could not be verified`. An IDOR guard
 *    that returns `true` when it cannot determine ownership is indistinguishable from
 *    no guard at all, which is exactly the "false assurance" this class of bug creates.
 *
 * ## Wiring
 *
 * The guard is registered and exported by `common.module.ts`, so any route can use
 * `@UseGuards(OwnershipGuard)`. `OWNERSHIP_RESOLVER` is deliberately NOT provided with a
 * default: there is no honest generic owner lookup, and a default that returned `null`
 * for every request would make a route look protected while denying all traffic. The
 * resources that own an author column and can resolve it supply one in their own module —
 * `CommentOwnershipResolver` and `StoryOwnershipResolver` today; see
 * `common/guards/README.md` for the list of routes still relying on an in-service owner check.
 *
 * See `common/guards/README.md` for the residual gap this guard does NOT close.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  private readonly options: OwnershipGuardOptions;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(OWNERSHIP_RESOLVER) private readonly resolver: OwnershipResolver | null = null,
    @Optional() @Inject(OWNERSHIP_GUARD_OPTIONS) options: OwnershipGuardOptions | null = null,
  ) {
    this.options = options ?? {};
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) {
      return true;
    }

    // Same normaliser `PermissionsGuard` reads through, so "which permissions does this route need"
    // has exactly one answer in the process.
    //
    // `.some(isOwnScoped)` rather than "the whole list is own-scoped": if even one permission on the
    // route is `:own`-scoped, the addressed resource is being edited or deleted by its owner, and
    // requiring ownership is the stricter reading of an ambiguous list. A route that names no
    // permission at all also falls through to the ownership check below, which is why a write route
    // behind only `JwtAuthGuard` is not silently exempt.
    const requirement = normalizePermissionRequirement(
      this.reflector.getAllAndOverride<unknown>(PERMISSIONS_KEY, targets),
    );
    if (requirement !== undefined && requirement.permissions.length > 0 && !requirement.permissions.some(isOwnScoped)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = request?.user;

    if (!user?.sub) {
      throw new ForbiddenException('Access denied');
    }

    if (this.options.allowSuperAdmin !== false && isSuperAdmin(user.accountType, user.adminRole)) {
      return true;
    }

    const ownerId = await this.resolveOwnerId(request);

    if (ownerId === null || ownerId !== user.sub) {
      throw new ForbiddenException(this.options.message ?? 'You do not own this resource');
    }

    return true;
  }

  private async resolveOwnerId(request: AuthRequest): Promise<string | null> {
    if (this.resolver === null) {
      // Fail closed, and say why in the message rather than 403-ing anonymously: a route
      // that registered the guard without a resolver is a wiring bug, and the operator
      // needs the reason in the log, not an indistinguishable "forbidden".
      throw new ForbiddenException('Ownership could not be verified');
    }
    try {
      return await this.resolver.resolveOwnerId(request);
    } catch {
      throw new ForbiddenException('Ownership could not be verified');
    }
  }
}

/**
 * Explicit construction, for tests and for callers that already hold the resolver.
 *
 * Prefer the injectable class in application code: `createOwnershipGuard` bypasses Nest
 * DI, so a guard built here cannot pick up `OWNERSHIP_RESOLVER` from a module.
 */
export const createOwnershipGuard = (
  reflector: Reflector,
  resolver: OwnershipResolver,
  options: OwnershipGuardOptions = {},
): OwnershipGuard => new OwnershipGuard(reflector, resolver, options);
