import { describe, it, expect, beforeEach, vi } from 'vitest';

import { RESTRICTION_TYPE_BAN, RESTRICTION_TYPE_MUTE, restrictionCacheKey } from '../constants/restrictions.ts';

import { ValkeyService } from './valkey.service.ts';
import { WinstonLoggerService } from './winston-logger.service.ts';
import { AccountRestrictionService } from './account-restriction.service.ts';

/**
 * The read both the guard and the auth flows share.
 *
 * WHY THIS SUITE EXISTS. `RestrictionGuard` used to read `restriction:<userId>` itself and
 * `AuthService` read `users.accessBlocked` — a column nothing in the backend writes — so the two
 * halves of "is this account restricted" were answered from two different stores, and the auth half
 * was answered from a store that is never written. Both now call this one reader, so what is pinned
 * here is the shared answer itself: which key, which values count, and what happens when Valkey fails.
 *
 * WHY THE SUITE MOCKS `get` ALONE. The reader used to issue `EXISTS` and then `GET`, on the theory
 * that "the key exists but its value is unreadable" had to be visible so the guard could apply its
 * documented rule — treat that state as *no restriction*. A single `GET` already returns `null` for
 * both the absent key and the unreadable one, which IS that rule, and the guard consumes this
 * method's return value rather than the two states separately. The second round trip bought
 * nothing and cost one per request on every mutating route and every login, refresh and OAuth call.
 */
describe('AccountRestrictionService', () => {
  let service: AccountRestrictionService;
  let valkey: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  const KEY = restrictionCacheKey('user-1');

  beforeEach(() => {
    // `exists` is still on the mock because the ValkeyService surface still has it; the point of the
    // suite below is that this reader never calls it.
    valkey = { exists: vi.fn(), get: vi.fn() };
    logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

    service = new AccountRestrictionService(
      valkey as unknown as ValkeyService,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('the cache key', () => {
    it('is the key ModerationEventHandler writes', async () => {
      // `moderation/restriction-policy.ts` supplies the value and the TTL; this key is how both the
      // guard and the auth flows find it. A key that drifted would be a ban nobody enforces.
      expect(KEY).toBe('restriction:user-1');
    });
  });

  describe('readCurrentRestriction', () => {
    it('reads the key the guard and the auth flows both use, in one read', async () => {
      valkey.get.mockResolvedValue('ban');

      await service.readCurrentRestriction('user-1');

      expect(valkey.get).toHaveBeenCalledWith(KEY);
      expect(valkey.get).toHaveBeenCalledTimes(1);
      // The second round trip is gone: `exists` was never the answer to any question the caller
      // asked, and it ran on every mutating request and every authentication.
      expect(valkey.exists).not.toHaveBeenCalled();
    });

    it('reads nothing when the key is absent', async () => {
      valkey.get.mockResolvedValue(null);

      await expect(service.readCurrentRestriction('user-1')).resolves.toBeNull();
    });

    it('returns the stored type when the key is present', async () => {
      valkey.get.mockResolvedValue('ban');

      await expect(service.readCurrentRestriction('user-1')).resolves.toBe('ban');
    });

    it('returns null for a present key with no readable value', async () => {
      // The guard's own rule: an unreadable key is not a restriction, because treating it as one lets
      // a stale or evicted key deny service with no explanation. `get` answers `null` for that case
      // and for the absent one alike, which is why one read carries the rule.
      valkey.get.mockResolvedValue(null);

      await expect(service.readCurrentRestriction('user-1')).resolves.toBeNull();
    });

    it('propagates a driver failure rather than deciding what it means', async () => {
      // The shared reader deliberately does NOT swallow the error. The guard fails open so a cache
      // outage is not an API outage; `hasActiveBan` fails open too, for its own documented reason.
      // Each caller owns that decision, and both must make it explicitly.
      valkey.get.mockRejectedValue(new Error('Valkey down'));

      await expect(service.readCurrentRestriction('user-1')).rejects.toThrow('Valkey down');
    });
  });

  describe('hasActiveBan', () => {
    it('is true for a banned account', async () => {
      valkey.get.mockResolvedValue(RESTRICTION_TYPE_BAN);

      await expect(service.hasActiveBan('user-1')).resolves.toBe(true);
    });

    it('is false for a muted account, because a mute is not a login restriction', async () => {
      // A mute stops writes, not reads. Logging in is how a muted user reaches what they are still
      // allowed to read, so refusing login would turn a mute into the lockout it deliberately is not.
      valkey.get.mockResolvedValue(RESTRICTION_TYPE_MUTE);

      await expect(service.hasActiveBan('user-1')).resolves.toBe(false);
    });

    it('is false for a value the moderation module does not restrict with', async () => {
      valkey.get.mockResolvedValue('warn');

      await expect(service.hasActiveBan('user-1')).resolves.toBe(false);
    });

    it('is false for an account with no restriction key at all', async () => {
      valkey.get.mockResolvedValue(null);

      await expect(service.hasActiveBan('user-1')).resolves.toBe(false);
    });

    it('fails open when the driver fails, and says so at ERROR level', async () => {
      // A cache outage must not become an authentication outage (Principle #12). It is logged loudly
      // instead of silently, so the gap is alertable rather than invisible.
      valkey.get.mockRejectedValue(new Error('Valkey down'));

      await expect(service.hasActiveBan('user-1')).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
        undefined,
        'AccountRestrictionService',
      );
    });
  });
});
