import { applyDecorators, UseGuards } from '@nestjs/common';

import type { AccountType } from '../constants/roles.ts';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.ts';
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
 * WHY `RestrictionGuard` IS HERE AND NOT APPLIED PER ROUTE. It was registered in neither
 * `CommonModule.providers` nor its exports, and applied to zero routes, while six documents described
 * it as live — the "false assurance" shape `common/guards/README.md` records for `OwnershipGuard`.
 * Composing it into `@Secured` means every already-secured route gets it, which is the correct blast
 * radius: a half-applied restriction control is exactly the failure this replaces.
 *
 * WHAT IT COSTS. One Valkey `EXISTS` per authenticated request. `ValkeyService.exists` returns false
 * when the client is null, so a Valkey outage makes this guard fail open — the same posture the WAF
 * blocklist takes, and the right direction here: a cache outage should not deny service to everyone.
 */
export const SECURED_GUARDS = [JwtAuthGuard, RestrictionGuard, RolesGuard, PermissionsGuard] as const;

export const Secured = (...accountTypes: AccountType[]) =>
  applyDecorators(UseGuards(...SECURED_GUARDS), ...(accountTypes.length > 0 ? [RequireRoles(...accountTypes)] : []));
