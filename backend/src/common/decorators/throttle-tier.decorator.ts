import { applyDecorators, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Reflector } from '@nestjs/core';

import {
  FALLBACK_THROTTLE_TIER,
  THROTTLE_TIERS,
  THROTTLE_TIER_NAMES,
  isThrottleTierName,
  type ThrottleTier,
  type ThrottleTierName,
} from '../../config/throttle.config.ts';

export const THROTTLE_TIER_METADATA = 'hakawi:throttle-tier';

/**
 * The static half of the contract: every tier name except the selected one is marked
 * "skip" for handlers that carry `@ThrottleTier(tier)`.
 *
 * It cannot be the whole contract. `@nestjs/throttler` only consults
 * `THROTTLER:SKIP<name>` metadata on the handler/class it is executing, so a handler
 * with NO decorator produces no skip metadata and every registered throttler runs.
 * See `buildThrottleTierSkipIf` for the half that covers undecorated handlers.
 */
export function buildThrottleTierSkipMap(tier: ThrottleTierName): Record<string, boolean> {
  const skip: Record<string, boolean> = {};
  for (const name of THROTTLE_TIER_NAMES) {
    skip[name] = name !== tier;
  }
  return skip;
}

export function ThrottleTier(tier: ThrottleTierName): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(THROTTLE_TIER_METADATA, tier), SkipThrottle(buildThrottleTierSkipMap(tier)));
}

/**
 * The tier NAME a handler explicitly declares, or `null` when it declares none.
 * Handler metadata wins over class metadata, matching `getAllAndOverride` order in
 * every other guard in this codebase.
 */
export function readDeclaredThrottleTierName(reflector: Reflector, context: ExecutionContext): ThrottleTierName | null {
  const handlerTier = reflector.get<string>(THROTTLE_TIER_METADATA, context.getHandler());
  const classTier = reflector.get<string>(THROTTLE_TIER_METADATA, context.getClass());
  const name = handlerTier ?? classTier;
  if (typeof name !== 'string' || !isThrottleTierName(name)) {
    return null;
  }
  return name;
}

export function readThrottleTier(reflector: Reflector, context: ExecutionContext): ThrottleTier | null {
  const name = readDeclaredThrottleTierName(reflector, context);
  return name === null ? null : THROTTLE_TIERS[name];
}

/**
 * The tier that is actually enforced for a request.
 *
 * A declared tier wins; an undecorated route gets `FALLBACK_THROTTLE_TIER` (`default`,
 * 100/min) and nothing else. Before this existed, an undecorated route got all four
 * tiers at once and the tightest (`upload`, 5/min, 60 s block) decided its fate.
 */
export function resolveEffectiveThrottleTier(reflector: Reflector, context: ExecutionContext): ThrottleTierName {
  return readDeclaredThrottleTierName(reflector, context) ?? FALLBACK_THROTTLE_TIER;
}

export function isThrottleTierEnforced(
  reflector: Reflector,
  context: ExecutionContext,
  tier: ThrottleTierName,
): boolean {
  return resolveEffectiveThrottleTier(reflector, context) === tier;
}

/**
 * `skipIf` for one registered throttler, evaluated per request by
 * `@nestjs/throttler`'s `canActivate`.
 *
 * Why `skipIf` and not more `@ThrottleTier` decorators: the guard's skip check is
 * `skip || skipIf?.(context)` where `skip` is `THROTTLER:SKIP<name>` metadata. Only
 * `skipIf` can be derived from configuration at bootstrap and applied to the ~20
 * controllers nobody decorated, which is what makes the `default` tier reachable
 * again without editing every controller (Principle #8: config-driven, not a
 * hardcoded list that has to be maintained by hand).
 *
 * MUST STAY SYNCHRONOUS. The library calls `skipIf(context)` without awaiting it
 * (`node_modules/@nestjs/throttler/dist/throttler.guard.js`, `canActivate`), so a
 * promise-returning predicate would be truthy on every request and would silently
 * disable the tier it belongs to. The declared return type is `boolean` for that
 * reason; there is no `Resolvable<boolean>` in `ThrottlerOptions`.
 */
export function buildThrottleTierSkipIf(
  reflector: Reflector,
  tier: ThrottleTierName,
): (context: ExecutionContext) => boolean {
  return (context: ExecutionContext): boolean => !isThrottleTierEnforced(reflector, context, tier);
}
