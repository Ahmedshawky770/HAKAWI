import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export const THROTTLE_TIER_NAMES = ['default', 'auth', 'session', 'upload', 'search'] as const;

export type ThrottleTierName = (typeof THROTTLE_TIER_NAMES)[number];

/**
 * The tier a route is limited by when it carries no `@ThrottleTier(...)` metadata.
 *
 * WHY THIS IS A CONSTANT AND NOT "WHATEVER THE FIRST TIER HAPPENS TO BE":
 * `@nestjs/throttler` registers EVERY named throttler as simultaneously active and
 * only skips one when `THROTTLER:SKIP<name>` metadata exists (see
 * `node_modules/@nestjs/throttler/dist/throttler.guard.js`, `canActivate`).
 * An undecorated handler therefore has no skip metadata at all, so all five tiers
 * run and the tightest one wins: the `upload` tier capped every untiered route in
 * the application at 5 requests/minute with a 60 second block, and the documented
 * `default` tier was unreachable everywhere.
 *
 * The fix is config-driven rather than "decorate all ~20 controllers": every
 * registered throttler carries a `skipIf` built from
 * `buildThrottleTierSkipIf(reflector, <its own name>)`, so a tier runs only when it
 * IS the route's effective tier, and the effective tier of an undecorated route is
 * this one. See `common/decorators/throttle-tier.decorator.ts`.
 */
export const FALLBACK_THROTTLE_TIER: ThrottleTierName = 'default';

export type ThrottleTrackerKind = 'ip' | 'user';

export interface ThrottleTier {
  readonly name: ThrottleTierName;
  readonly limit: number;
  readonly ttlMs: number;
  /**
   * The dedicated block window applied once the limit is exhausted.
   *
   * `0` means "this tier declares no block window of its own". It is not "never
   * block": `@nestjs/throttler` resolves
   * `blockDuration || ttl`, so a 0 falls through to the request window and the
   * caller stays blocked for the remainder of the minute it just exhausted.
   * A positive `THROTTLE_BLOCK_DURATION` replaces every 0 at config-build time so
   * an operator can set one block length for all tiers that do not declare one.
   */
  readonly blockDurationMs: number;
  readonly tracker: ThrottleTrackerKind;
  readonly description: string;
  readonly docRef: string;
}

const MINUTE_MS = 60_000;

export const THROTTLE_TIERS: Readonly<Record<ThrottleTierName, ThrottleTier>> = {
  default: {
    name: 'default',
    // 30/min, not 100. This is the tier every route without @ThrottleTier falls back to, and
    // the tier the `user` tracker silently degrades to per-IP on (JwtAuthGuard is not an APP_GUARD,
    // so `request.user` is unset when ThrottlerGuard runs — see common/throttler/throttle-options.ts).
    // A per-IP ceiling has to survive a scraper, so 100/min gave every source address a budget
    // large enough to enumerate a user list. 30/min is comfortably above interactive browsing
    // (a page load is a handful of calls, and assets are served by the frontend, not the API)
    // while still bounding a single address.
    limit: 30,
    ttlMs: MINUTE_MS,
    blockDurationMs: 0,
    tracker: 'user',
    description: 'Authenticated API traffic, per user (falls back to per IP when unauthenticated).',
    docRef: 'docs/api-contract/openapi/rest-api-spec.md:383',
  },
  auth: {
    name: 'auth',
    limit: 10,
    ttlMs: MINUTE_MS,
    blockDurationMs: MINUTE_MS,
    tracker: 'ip',
    description: 'Login, register and password-reset endpoints, per IP.',
    docRef: 'docs/api-contract/openapi/rest-api-spec.md:384',
  },
  session: {
    name: 'session',
    // Refresh is MACHINE-driven: the browser fires one per page load, and several tabs plus a
    // poll or two can stack up. It used to share the `auth` tier's 10/min per IP, which is a
    // human-login budget. Behind an office NAT or a mobile CGNAT every user behind that egress
    // shares one counter, so ten automatic refreshes across the building blocked the whole
    // egress address for 60 seconds and logged everybody out. This tier is deliberately loose
    // and deliberately does not block: an over-limit refresh is refused with 429 and the client
    // still has its access token until it expires.
    limit: 120,
    ttlMs: MINUTE_MS,
    blockDurationMs: 0,
    tracker: 'ip',
    description: 'Token refresh and session endpoints, per IP. Machine traffic, not human login attempts.',
    docRef: 'docs/api-contract/openapi/rest-api-spec.md:386',
  },
  upload: {
    name: 'upload',
    limit: 5,
    ttlMs: MINUTE_MS,
    blockDurationMs: MINUTE_MS,
    tracker: 'user',
    description: 'Media upload endpoints, per user.',
    docRef: 'docs/api-contract/openapi/rest-api-spec.md:385',
  },
  search: {
    name: 'search',
    limit: 50,
    ttlMs: MINUTE_MS,
    blockDurationMs: 0,
    tracker: 'user',
    description: 'Search and suggestion endpoints, per user.',
    docRef: 'docs/security-architecture/waf/waf-overview.md:47',
  },
};

export function isThrottleTierName(value: string): value is ThrottleTierName {
  return (THROTTLE_TIER_NAMES as readonly string[]).includes(value);
}

const booleanFlag = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  THROTTLE_TTL: z.coerce.number().int().positive().optional(),
  THROTTLE_LIMIT: z.coerce.number().int().positive().optional(),
  THROTTLE_DEFAULT_TTL: z.coerce.number().int().positive().default(THROTTLE_TIERS.default.ttlMs),
  THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(THROTTLE_TIERS.default.limit),
  THROTTLE_AUTH_TTL: z.coerce.number().int().positive().default(THROTTLE_TIERS.auth.ttlMs),
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(THROTTLE_TIERS.auth.limit),
  THROTTLE_SESSION_TTL: z.coerce.number().int().positive().default(THROTTLE_TIERS.session.ttlMs),
  THROTTLE_SESSION_LIMIT: z.coerce.number().int().positive().default(THROTTLE_TIERS.session.limit),
  THROTTLE_UPLOAD_TTL: z.coerce.number().int().positive().default(THROTTLE_TIERS.upload.ttlMs),
  THROTTLE_UPLOAD_LIMIT: z.coerce.number().int().positive().default(THROTTLE_TIERS.upload.limit),
  THROTTLE_SEARCH_TTL: z.coerce.number().int().positive().default(THROTTLE_TIERS.search.ttlMs),
  THROTTLE_SEARCH_LIMIT: z.coerce.number().int().positive().default(THROTTLE_TIERS.search.limit),
  THROTTLE_BLOCK_DURATION: z.coerce.number().int().nonnegative().default(0),
  /**
   * Opt-in acknowledgement for the global escape hatch, see `buildThrottleConfig`.
   */
  THROTTLE_ALLOW_GLOBAL_OVERRIDE: booleanFlag.default(false),
  THROTTLE_TRUST_PROXY: booleanFlag.default(false),
});

export interface ThrottleConfig {
  readonly tiers: Readonly<Record<ThrottleTierName, ThrottleTier>>;
  readonly trustProxy: boolean;
  /** The block window applied to every tier that does not declare one. */
  readonly defaultBlockDurationMs: number;
  /** True only when the global escape hatch was both requested AND acknowledged. */
  readonly globalOverrideApplied: boolean;
  /**
   * Operator-facing sentences the bootstrap has to print.
   *
   * A rate-limit control that can be switched off by one stray environment variable
   * is not a control, so anything noteworthy about the override is stated here and
   * emitted at WARN by `main.ts` through the injected Winston logger (Principle #2).
   * Kept as data rather than a log call so `buildThrottleConfig` stays pure and
   * testable, and so the unit suite does not need a logger to assert on it.
   */
  readonly globalOverrideWarnings: readonly string[];
}

const GLOBAL_OVERRIDE_UNLOCK_INSTRUCTION =
  'Set THROTTLE_ALLOW_GLOBAL_OVERRIDE=true to acknowledge that this disables rate limiting everywhere, ' +
  'and prefer the per-tier variables (THROTTLE_DEFAULT_LIMIT, THROTTLE_AUTH_TTL, …).';

/**
 * `THROTTLE_TTL` / `THROTTLE_LIMIT` replace the window or the limit of EVERY tier at
 * once. That is a rate-limit bypass, not a configuration, so it is now opt-in-only:
 *
 * - Not acknowledged  → the override is REFUSED (the per-tier limits stand) and a
 *   warning is queued. Under `NODE_ENV=production` the refusal is fatal, because a
 *   production deployment must not be silently rate-limit-disabled by one stray var.
 * - Acknowledged      → the override is applied, and a warning is queued anyway so the
 *   state is visible in the logs of the process that is running with it disabled.
 *
 * The escape hatch still exists because the e2e suite needs to switch throttling off for the
 * suite; it must also set `THROTTLE_ALLOW_GLOBAL_OVERRIDE=true` (see
 * `backend/vitest.config.e2e.ts`, which does).
 */
export function buildThrottleConfig(source: NodeJS.ProcessEnv): ThrottleConfig {
  const env = envSchema.parse(source);
  const warnings: string[] = [];

  let globalLimit: number | undefined;
  let globalTtl: number | undefined;
  const requestedGlobals: string[] = [];
  if (env.THROTTLE_LIMIT !== undefined) {
    requestedGlobals.push('THROTTLE_LIMIT');
  }
  if (env.THROTTLE_TTL !== undefined) {
    requestedGlobals.push('THROTTLE_TTL');
  }

  if (requestedGlobals.length > 0) {
    const names = requestedGlobals.join(', ');
    if (!env.THROTTLE_ALLOW_GLOBAL_OVERRIDE) {
      const refusal =
        `Throttle global override REFUSED: ${names} was set without THROTTLE_ALLOW_GLOBAL_OVERRIDE=true. ` +
        'The documented per-tier limits are in force. ' +
        GLOBAL_OVERRIDE_UNLOCK_INSTRUCTION;
      if (env.NODE_ENV === 'production') {
        throw new Error(
          `${refusal} Refusing to start with NODE_ENV=production rather than booting a rate-limit-free API.`,
        );
      }
      warnings.push(refusal);
    } else {
      globalLimit = env.THROTTLE_LIMIT;
      globalTtl = env.THROTTLE_TTL;
      warnings.push(
        `Throttle global override APPLIED: ${names} replaces the limit/window of EVERY tier because ` +
          'THROTTLE_ALLOW_GLOBAL_OVERRIDE=true. Rate limiting is effectively disabled on this process.',
      );
    }
  }

  const defaultBlockDurationMs = env.THROTTLE_BLOCK_DURATION;

  const withOverrides = (tier: ThrottleTier, limit: number, ttl: number): ThrottleTier => ({
    ...tier,
    limit: globalLimit ?? limit,
    ttlMs: globalTtl ?? ttl,
    // A tier that declares 0 has no block window of its own, so THROTTLE_BLOCK_DURATION
    // supplies one. This is the documented meaning of the variable, which used to be
    // parsed and then never read by anything.
    blockDurationMs: tier.blockDurationMs > 0 ? tier.blockDurationMs : defaultBlockDurationMs,
  });

  return {
    trustProxy: env.THROTTLE_TRUST_PROXY,
    defaultBlockDurationMs,
    globalOverrideApplied: globalLimit !== undefined || globalTtl !== undefined,
    globalOverrideWarnings: Object.freeze(warnings),
    tiers: {
      default: withOverrides(THROTTLE_TIERS.default, env.THROTTLE_DEFAULT_LIMIT, env.THROTTLE_DEFAULT_TTL),
      auth: withOverrides(THROTTLE_TIERS.auth, env.THROTTLE_AUTH_LIMIT, env.THROTTLE_AUTH_TTL),
      session: withOverrides(THROTTLE_TIERS.session, env.THROTTLE_SESSION_LIMIT, env.THROTTLE_SESSION_TTL),
      upload: withOverrides(THROTTLE_TIERS.upload, env.THROTTLE_UPLOAD_LIMIT, env.THROTTLE_UPLOAD_TTL),
      search: withOverrides(THROTTLE_TIERS.search, env.THROTTLE_SEARCH_LIMIT, env.THROTTLE_SEARCH_TTL),
    },
  };
}

export default registerAs('throttle', () => buildThrottleConfig(process.env));
