import type { Reflector } from '@nestjs/core';
import type { ThrottlerOptions } from '@nestjs/throttler';

import type { ThrottleTier, ThrottleTrackerKind } from '../../config/throttle.config.ts';
import { buildThrottleTierSkipIf } from '../decorators/throttle-tier.decorator.ts';

const TRACKER_USER_PREFIX = 'user:';
const TRACKER_IP_PREFIX = 'ip:';
const TRACKER_UNKNOWN = `${TRACKER_IP_PREFIX}unknown`;

/**
 * Reads the verified subject id off the request.
 *
 * `JwtAuthGuard` assigns `request.user = payload` where the payload is
 * `JwtPayload { sub; email; accountType; adminRole? }` (`common/utils/jwt.util.ts:6-11`).
 * THERE IS NO `id` FIELD ON THAT TYPE. The tracker this replaced read `user.id`, which
 * can never be a string on a verified request, so every `tracker: 'user'` tier silently
 * degraded to per-IP while the documentation claimed "per user". `sub` is the JWT
 * subject claim, a string (Principle #3), and is the only field read here.
 *
 * The shape is checked rather than asserted: a non-empty string is required and anything
 * else falls through to the IP path, because a tracker returning `user:undefined` would
 * collapse every caller into one shared bucket — a strictly worse failure than falling
 * back to per-IP.
 */
export function authenticatedSubjectOf(request: Record<string, unknown>): string | null {
  const user = request.user;
  if (typeof user !== 'object' || user === null) {
    return null;
  }
  const subject = (user as { sub?: unknown }).sub;
  return typeof subject === 'string' && subject.length > 0 ? subject : null;
}

/**
 * Resolves the caller address, in order of decreasing trust.
 *
 * `X-Forwarded-For` is client-settable, so it is only read when `trustProxy` is on —
 * the same `THROTTLE_TRUST_PROXY` decision `WafMiddleware` uses. Both layers key
 * blocklists and budgets on an address, so disagreeing about whether that address is
 * forgeable would mean one of the two protections is bypassable (Principle #9).
 */
export function clientAddressOf(request: Record<string, unknown>, trustProxy: boolean): string {
  const headers = request.headers;
  const headerMap = typeof headers === 'object' && headers !== null ? (headers as Record<string, unknown>) : {};
  if (trustProxy) {
    const forwarded = headerMap['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return `${TRACKER_IP_PREFIX}${forwarded.split(',')[0]?.trim() ?? forwarded}`;
    }
  }

  if (typeof request.ip === 'string' && request.ip.length > 0) {
    return `${TRACKER_IP_PREFIX}${request.ip}`;
  }

  const socket = request.socket;
  if (typeof socket === 'object' && socket !== null) {
    const remote = (socket as { remoteAddress?: unknown }).remoteAddress;
    if (typeof remote === 'string' && remote.length > 0) {
      return `${TRACKER_IP_PREFIX}${remote}`;
    }
  }
  return TRACKER_UNKNOWN;
}

/**
 * @see authenticatedSubjectOf for why `sub` and not `id`.
 *
 * DOCUMENTED FALLBACK, not an accident. When no verified subject is on the request the
 * tracker keys on the caller address. That is the case for every `@Public()` route, and
 * — because `@nestjs/throttler` is bound as a global `APP_GUARD` and Nest runs global
 * enhancers BEFORE route-scoped ones — also the case for routes whose `@UseGuards(
 * JwtAuthGuard)` has not run yet at throttle time. The honest description of a
 * `tracker: 'user'` tier today is therefore "per user when a subject is already present,
 * per IP otherwise".
 *
 * Consequences, stated so nobody is surprised: an unauthenticated endpoint is limited per
 * IP, so a single NAT or corporate egress shares one budget; and a caller that can vary
 * its source address gets a fresh budget. That is the accepted trade-off — the
 * alternative, no limit on public routes, is worse. The residual gap (a global auth guard
 * would populate `request.user` first, but that changes authorization for every endpoint
 * and is not this module's decision) is reported rather than papered over.
 */
export function createThrottleTrackerResolver(
  kind: ThrottleTrackerKind,
  trustProxy: boolean,
): (request: Record<string, unknown>) => string {
  return (request: Record<string, unknown>): string => {
    if (kind === 'user') {
      const subject = authenticatedSubjectOf(request);
      if (subject !== null) {
        return `${TRACKER_USER_PREFIX}${subject}`;
      }
    }
    return clientAddressOf(request, trustProxy);
  };
}

/**
 * Turn one configured tier into one `@nestjs/throttler` throttler.
 *
 * `skipIf` is the load-bearing part: without it every registered throttler is active on
 * every route and the tightest tier decides the outcome, which is how the 5/min `upload`
 * tier ended up governing the entire API. See `FALLBACK_THROTTLE_TIER` in
 * `config/throttle.config.ts` and `buildThrottleTierSkipIf` in the decorator module.
 */
export function createThrottlerOptions(
  tier: ThrottleTier,
  trustProxy: boolean,
  reflector: Reflector,
): ThrottlerOptions {
  return {
    name: tier.name,
    limit: tier.limit,
    ttl: tier.ttlMs,
    blockDuration: tier.blockDurationMs,
    getTracker: createThrottleTrackerResolver(tier.tracker, trustProxy),
    setHeaders: true,
    skipIf: buildThrottleTierSkipIf(reflector, tier.name),
  };
}
