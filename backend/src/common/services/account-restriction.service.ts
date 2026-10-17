import { Inject, Injectable } from '@nestjs/common';

import { RESTRICTION_TYPE_BAN, RESTRICTION_TYPE_MUTE, restrictionCacheKey } from '../constants/restrictions.ts';

import { ValkeyService } from './valkey.service.ts';
import { WinstonLoggerService } from './winston-logger.service.ts';

/** What an account is currently restricted by, in the vocabulary the moderation module stores. */
export type AccountRestrictionType = typeof RESTRICTION_TYPE_BAN | typeof RESTRICTION_TYPE_MUTE | string;

/**
 * Cheap last-known health of the Valkey restriction store, for `GET /api/v1/metrics/degradation`.
 *
 * `available` is `null` until the first operation, so "not yet exercised" is distinguishable
 * from "exercised and broken". `consecutiveFailures` is what a deployment alerts on: while it
 * is above zero, bans are not enforced at login, refresh or OAuth callbacks, and
 * `RestrictionGuard` fails open on every authenticated route.
 */
export interface AccountRestrictionHealth {
  readonly available: boolean | null;
  readonly consecutiveFailures: number;
  readonly lastFailureAtMs: number | null;
}

/**
 * THE ONE READER OF "WHAT IS THIS ACCOUNT RESTRICTED BY?"
 *
 * WHY THIS EXISTS. Two places needed the same answer and neither had it:
 *
 * 1. `RestrictionGuard` read `restriction:<userId>` from Valkey and enforced `ban` with a 403 and
 *    `mute` with a 423 on writes.
 * 2. `AuthService` read `users.accessBlocked` instead — a column nothing in the backend ever writes.
 *    Moderation does not set it: `ModerationService.takeAction` inserts a `user_restrictions` row and
 *    `ModerationEventHandler` writes the Valkey key. So a banned account was locked out of every
 *    authenticated route by the guard, and could still log in, refresh its tokens and sign in through
 *    any of the five OAuth providers, because those routes are `@Public()` and the guard never runs
 *    on them.
 *
 * The read is now one method consumed by both (Principle #9), so "currently banned" cannot mean one
 * thing in the guard and another in the auth flows.
 *
 * WHY ONLY `ban` BLOCKS AUTHENTICATION. A mute is a write restriction: the moderation module stores
 * it as `mute`, the key's TTL is derived from the moderator's chosen duration, and `RestrictionGuard`
 * enforces it as "you may read, you may not post" (423). Logging in is neither of those — it is how
 * the muted user reaches the content they are still allowed to read, and refusing it would turn a
 * mute into a full account lockout. A mute on login is therefore a restriction the moderation module
 * did not impose.
 *
 * WHY THE TTL IS NOT CHECKED HERE. The cache key carries the restriction's own expiry — the
 * moderator's `durationMinutes`, falling back to the policy's default — so "currently restricted"
 * is exactly "the key is present with a value". Deriving a second expiry rule here is the bug that
 * `moderation/restriction-policy.ts` was written to end.
 *
 * WHY THIS FAILS OPEN. A Valkey driver failure here would otherwise reject out of `login`,
 * `refreshTokens` and `findOrCreateOAuthUser` — a total authentication outage caused by a cache
 * fault, which is the cascade Principle #12 exists to prevent, and the same posture the WAF IP
 * blocklist and the `RestrictionGuard` itself already take. The window it opens is bounded by the
 * Valkey outage itself: every failure is logged at ERROR with the account id (alertable, not silent),
 * and every subsequent request the account makes is still checked by `RestrictionGuard`. The
 * alternative — 503 on every login for the duration of a cache incident — was rejected deliberately.
 * It converts a degraded cache into a degraded product for every user, not only for the accounts a
 * ban was meant to reach.
 */
@Injectable()
export class AccountRestrictionService {
  private consecutiveFailures = 0;
  private lastFailureAtMs: number | null = null;
  private lastKnownAvailable: boolean | null = null;

  constructor(
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  /**
   * Last-known health of the Valkey restriction store. Safe to call on the healthy path.
   */
  health(): AccountRestrictionHealth {
    return {
      available: this.lastKnownAvailable,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureAtMs: this.lastFailureAtMs,
    };
  }

  private noteStoreReachable(): void {
    this.lastKnownAvailable = true;
    this.consecutiveFailures = 0;
  }

  private noteStoreFailure(cause: string, error?: unknown): void {
    this.lastKnownAvailable = false;
    this.consecutiveFailures += 1;
    this.lastFailureAtMs = Date.now();
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Account restriction lookup failed for ${cause}; failing open: ${reason}`,
      undefined,
      'AccountRestrictionService',
    );
  }

  /**
   * The restriction currently enforced against an account, or `null` when there is none.
   *
   * One read, not two. This used to issue `EXISTS` and then `GET`, on the theory that "the key
   * exists but its value is unreadable" had to be visible so the guard could apply its documented
   * rule — treat that state as *no restriction*. But a `GET` already answers `null` for both the
   * absent key and the unreadable one, which IS that rule, and the guard consumes this method's
   * return value and never sees the two states separately. The extra round trip therefore bought
   * nothing and cost one per request on every mutating route and every login, refresh and OAuth
   * call — so it went.
   *
   * This method REJECTS when the Valkey driver itself failed. It deliberately does not decide what a
   * driver failure means, because the two callers need opposite answers: the guard must fail open so
   * a cache outage is not an API outage, and the auth flows are a security decision that must not
   * silently degrade. Every caller therefore has to handle the rejection explicitly — the choice is
   * theirs to make and its own to document.
   */
  async readCurrentRestriction(userId: string): Promise<AccountRestrictionType | null> {
    try {
      const result = await this.valkeyService.get(restrictionCacheKey(userId));
      this.noteStoreReachable();
      return result;
    } catch (error) {
      this.noteStoreFailure(`readCurrentRestriction(user ${userId})`, error);
      throw error;
    }
  }

  /**
   * Whether the account is CURRENTLY banned, for the authentication paths.
   *
   * WHY THIS FAILS OPEN. A Valkey driver failure here would otherwise reject out of `login`,
   * `refreshTokens` and `findOrCreateOAuthUser` — a total authentication outage caused by a cache
   * fault, which is the cascade Principle #12 exists to prevent, and the same posture the WAF IP
   * blocklist and the `RestrictionGuard` itself already take. The window it opens is bounded by the
   * cache outage, is logged at ERROR level with the account id so it is alertable rather than
   * silent, and every request the account makes afterwards is still checked by `RestrictionGuard`.
   *
   * The alternative — 503 on every login for the duration of a cache incident — was rejected
   * deliberately. It converts a degraded cache into a degraded product for every user, not only for
   * the accounts a ban was meant to reach.
   */
  async hasActiveBan(userId: string): Promise<boolean> {
    try {
      const result = (await this.readCurrentRestriction(userId)) === RESTRICTION_TYPE_BAN;
      this.noteStoreReachable();
      return result;
    } catch (error) {
      this.noteStoreFailure(`hasActiveBan(user ${userId})`, error);
      // Failing open: a cache outage must not become an authentication outage (Principle #12).
      // The cost is a ban unenforced for the length of the outage — the same posture the guard
      // and the WAF blocklist already take — and strictly better than 503-ing every login in the
      // product for a cache fault.
      return false;
    }
  }
}
