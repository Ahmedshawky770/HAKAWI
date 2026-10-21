import { applyDecorators, UseGuards } from '@nestjs/common';

import type { AccountType } from '../constants/roles.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
import { MfaGuard } from '../guards/mfa.guard.ts';
import { PermissionsGuard } from '../guards/permissions.guard.ts';
import { RestrictionGuard } from '../guards/restriction.guard.ts';
import { RolesGuard } from '../guards/roles.guard.ts';

import { RequireRoles } from './roles.decorator.ts';

/**
 * THE ORDER IS THE CONTRACT.
 *
 * `JwtAuthGuard` populates `request.user`, so it must run first — `RestrictionGuard` reads
 * `request.user.sub` and passes when it is absent, which means a different position would silently
 * turn every restricted-account check into a no-op rather than into an error. `RolesGuard` and
 * `PermissionsGuard` then decide whether the caller may perform the action at all, which is a
 * question about permissions rather than about account state, so a restricted account is refused
 * before it reaches them rather than after.
 *
 * `MfaGuard` is LAST, and it is last for the same reason `RestrictionGuard` is not first: it
 * reads `request.user` too, and it is the narrowest of the five — it only does anything on a
 * route that asked for it with `@RequireMfa()`.
 *
 * WHY `RestrictionGuard` IS HERE AND NOT APPLIED PER ROUTE. It was registered in neither
 * `CommonModule.providers` nor its exports, and applied to zero routes, while six documents described
 * it as live — the "false assurance" shape `common/guards/README.md` records for `OwnershipGuard`.
 * Composing it into `@Secured` means every already-secured route gets it, which is the correct blast
 * radius: a half-applied restriction control is exactly the failure this replaces.
 *
 * WHAT IT COSTS. One Valkey `EXISTS` per authenticated request. `ValkeyService.exists` returns false
 * when the client is null, so a Valkey outage makes this guard fail open — the same posture the WAF
 * blocklist takes, and the right direction here: a cache outage should not deny service to everyone.
 *
 * WHY `MfaGuard` IS HERE AND NOT APPLIED PER ROUTE. The same reason, and the same failure it
 * replaces: `MfaGuard` was provided by `CommonModule` and applied to ZERO routes, so every
 * `@RequireMfa()` in the codebase — on the admin break-glass route, on the moderation routes, on the
 * financial routes — was a decoration that did nothing. An account with an admin role could reach
 * the routes that demand a second factor without presenting one. Composing the guard here is what
 * makes `@RequireMfa()` mean something, and it means a route cannot forget it: the decorator that
 * asks for MFA and the guard that enforces it live in the same file.
 *
 * WHAT IT COSTS. Two reflector lookups per authenticated request, and — only on a route that asked
 * for MFA — one database read to find out whether the caller has an admin role to enforce MFA for.
 * A route without `@RequireMfa()` pays the lookups and nothing else.
 */
export const SECURED_GUARDS = [
  JwtAuthGuard,
  RestrictionGuard,
  RolesGuard,
  PermissionsGuard,
  MfaGuard,
] as const;

export const Secured = (...accountTypes: AccountType[]) =>
  applyDecorators(UseGuards(...SECURED_GUARDS), ...(accountTypes.length > 0 ? [RequireRoles(...accountTypes)] : []));
