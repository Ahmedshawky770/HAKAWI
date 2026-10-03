import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';

import { ValkeyService } from '../services/valkey.service.ts';
import type { DegradationSink } from '../observability/degradation.ts';

import { ValkeyThrottlerStorage, type ValkeyThrottlerStorageRecord } from './valkey-throttler.storage.ts';

type RecordingSink = {
  [Level in keyof DegradationSink]: ReturnType<typeof vi.fn<DegradationSink[Level]>>;
};

function recordingSink(): RecordingSink {
  return { warn: vi.fn<DegradationSink['warn']>(), info: vi.fn<DegradationSink['info']>() };
}

class FakeValkey {
  strings = new Map<string, string>();
  expiries = new Map<string, number>();
  available = true;
  incrCalls = 0;
  expireCalls = 0;
  ttlCalls = 0;
  now = 0;

  private live(key: string): boolean {
    const expiresAt = this.expiries.get(key);
    if (expiresAt !== undefined && expiresAt <= this.now) {
      this.strings.delete(key);
      this.expiries.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key) ? (this.strings.get(key) ?? null) : null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.strings.set(key, value);
    if (ttl !== undefined) {
      this.expiries.set(key, this.now + ttl * 1000);
    } else {
      this.expiries.delete(key);
    }
  }

  async del(key: string): Promise<void> {
    this.strings.delete(key);
    this.expiries.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.live(key) && this.strings.has(key);
  }

  async incr(key: string): Promise<number> {
    this.incrCalls += 1;
    this.live(key);
    const next = Number.parseInt(this.strings.get(key) ?? '0', 10) + 1;
    this.strings.set(key, String(next));
    return next;
  }

  /**
   * Mirrors the real Lua script: counter and TTL are established in one atomic step, and the
   * TTL is set only when the key is absent so a hot counter cannot slide its window forward.
   */
  async incrWithTtl(key: string, ttl: number): Promise<number> {
    this.incrCalls += 1;
    this.live(key);
    if (!this.strings.has(key)) {
      this.strings.set(key, '0');
      this.expiries.set(key, this.now + ttl * 1000);
    }
    const next = Number.parseInt(this.strings.get(key) ?? '0', 10) + 1;
    this.strings.set(key, String(next));
    return next;
  }

  async expire(key: string, ttl: number): Promise<void> {
    this.expireCalls += 1;
    this.expiries.set(key, this.now + ttl * 1000);
  }

  async ttl(key: string): Promise<number> {
    this.ttlCalls += 1;
    if (!this.live(key)) {
      return -2;
    }
    const expiresAt = this.expiries.get(key);
    if (expiresAt === undefined) {
      return -1;
    }
    return Math.floor((expiresAt - this.now) / 1000);
  }

  async ping(): Promise<string> {
    if (!this.available) {
      throw new Error('Valkey client not initialized');
    }
    return 'PONG';
  }

  syncClock(current: number): void {
    this.now = current;
  }
}

describe('ValkeyThrottlerStorage', () => {
  let valkey: FakeValkey;
  let fallback: ThrottlerStorage;
  let now: number;
  let storage: ValkeyThrottlerStorage;
  let logger: RecordingSink;

  beforeEach(() => {
    valkey = new FakeValkey();
    fallback = new ThrottlerStorageService();
    now = 1_700_000_000_000;
    valkey.syncClock(now);
    logger = { warn: vi.fn(), info: vi.fn() };
    storage = new ValkeyThrottlerStorage(valkey as unknown as ValkeyService, {
      fallback,
      availabilityProbeIntervalMs: 0,
      now: () => now,
      logger,
    });
  });

  function advance(milliseconds: number): void {
    now += milliseconds;
    valkey.syncClock(now);
  }

  describe('availability', () => {
    it('reports available when Valkey answers PONG', async () => {
      await expect(storage.isAvailable()).resolves.toBe(true);
    });

    it('reports unavailable when Valkey throws', async () => {
      valkey.available = false;
      await expect(storage.isAvailable()).resolves.toBe(false);
    });

    it('caches a positive probe until the interval elapses', async () => {
      const cached = new ValkeyThrottlerStorage(valkey as unknown as ValkeyService, {
        fallback,
        availabilityProbeIntervalMs: 60_000,
        now: () => now,
      });
      await expect(cached.isAvailable()).resolves.toBe(true);

      valkey.available = false;
      await expect(cached.isAvailable()).resolves.toBe(true);

      advance(60_000);
      await expect(cached.isAvailable()).resolves.toBe(false);
    });
  });

  describe('counting within the window', () => {
    it('increments the shared Valkey counter and stays unblocked below the limit', async () => {
      const first = await storage.increment('key-a', 60_000, 3, 0, 'default');
      const second = await storage.increment('key-a', 60_000, 3, 0, 'default');
      const third = await storage.increment('key-a', 60_000, 3, 0, 'default');

      expect([first.totalHits, second.totalHits, third.totalHits]).toEqual([1, 2, 3]);
      expect(first.isBlocked).toBe(false);
      expect(third.isBlocked).toBe(false);
    });

    it('sets the window TTL only on the first increment so the window cannot be extended', async () => {
      // The TTL is established inside the atomic incr-with-TTL script, so it is asserted on the
      // resulting expiry rather than on a separate EXPIRE round trip. What matters is that a
      // later hit does NOT push the expiry forward: a sliding window lets a slow attacker stay
      // under the limit for ever.
      await storage.increment('key-a', 60_000, 5, 0, 'default');
      const firstWindowExpiry = valkey.expiries.get('throttle:hits:default:key-a');
      expect(firstWindowExpiry).toBe(now + 60_000);

      advance(10_000);
      await storage.increment('key-a', 60_000, 5, 0, 'default');
      expect(valkey.expiries.get('throttle:hits:default:key-a')).toBe(firstWindowExpiry);
    });

    it('reports the remaining window in seconds', async () => {
      const record = await storage.increment('key-a', 60_000, 5, 0, 'default');
      expect(record.timeToExpire).toBe(60);

      advance(20_000);
      const later = await storage.increment('key-a', 60_000, 5, 0, 'default');
      expect(later.timeToExpire).toBe(40);
    });

    it('never reports a negative remaining window', async () => {
      await storage.increment('key-a', 60_000, 5, 0, 'default');
      advance(120_000);
      const record = await storage.increment('key-a', 60_000, 5, 0, 'default');
      expect(record.timeToExpire).toBeGreaterThanOrEqual(0);
      expect(record.totalHits).toBe(1);
    });

    it('reads the remaining window from the counter TTL instead of a side-car meta key', async () => {
      await storage.increment('key-a', 60_000, 5, 0, 'default');
      advance(20_000);
      const record = await storage.increment('key-a', 60_000, 5, 0, 'default');

      expect(record.timeToExpire).toBe(40);
      expect(valkey.ttlCalls).toBe(1);
      expect([...valkey.strings.keys()].filter((key) => key.startsWith('throttle:meta'))).toEqual([]);
    });

    it('knows the whole window on the first hit without reading the TTL back', async () => {
      const record = await storage.increment('key-a', 60_000, 5, 0, 'default');

      expect(record.timeToExpire).toBe(60);
      expect(valkey.ttlCalls).toBe(0);
    });

    it('falls back to the configured window when the counter TTL has already lapsed', async () => {
      await storage.increment('key-a', 60_000, 5, 0, 'default');
      valkey.strings.set('throttle:hits:default:key-a', '4');
      valkey.expiries.delete('throttle:hits:default:key-a');

      const record = await storage.increment('key-a', 60_000, 5, 0, 'default');

      expect(record.timeToExpire).toBe(60);
    });

    it('keeps separate counters per key and per throttler name', async () => {
      await storage.increment('key-a', 60_000, 5, 0, 'default');
      await storage.increment('key-a', 60_000, 5, 0, 'auth');

      const otherKey = await storage.increment('key-b', 60_000, 5, 0, 'default');
      const auth = await storage.increment('key-a', 60_000, 5, 0, 'auth');

      expect(otherKey.totalHits).toBe(1);
      expect(auth.totalHits).toBe(2);
    });

    it('still counts a request when the configured window is zero', async () => {
      const record = await storage.increment('key-a', 0, 5, 0, 'default');
      expect(record.totalHits).toBe(1);
      expect(record.isBlocked).toBe(false);
      expect(valkey.expiries.has('throttle:hits:default:key-a')).toBe(false);
    });
  });

  describe('concurrency', () => {
    it('never loses an increment across concurrent requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => storage.increment('shared', 60_000, 100, 0, 'default')),
      );

      const hits = results.map((record) => record.totalHits);
      expect(new Set(hits).size).toBe(50);
      expect(Math.max(...hits)).toBe(50);
      expect(valkey.strings.get('throttle:hits:default:shared')).toBe('50');
    });

    it('blocks exactly once the concurrent burst crosses the limit', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => storage.increment('burst', 60_000, 5, 60_000, 'default')),
      );
      const blocked = results.filter((record) => record.isBlocked);

      expect(blocked).toHaveLength(15);
      expect(blocked[0]?.totalHits).toBe(6);
    });
  });

  describe('blocking', () => {
    it('blocks and reports Retry-After once the limit is exceeded', async () => {
      for (let index = 0; index < 3; index += 1) {
        await storage.increment('key-b', 60_000, 2, 30_000, 'auth');
      }

      const record = await storage.increment('key-b', 60_000, 2, 30_000, 'auth');
      expect(record.isBlocked).toBe(true);
      expect(record.timeToBlockExpire).toBe(30);
    });

    it('keeps returning the block without incrementing while the block is active', async () => {
      for (let index = 0; index < 3; index += 1) {
        await storage.increment('key-c', 60_000, 2, 30_000, 'auth');
      }
      const before = valkey.incrCalls;

      advance(10_000);
      const record = await storage.increment('key-c', 60_000, 2, 30_000, 'auth');

      expect(record.isBlocked).toBe(true);
      expect(record.timeToBlockExpire).toBe(20);
      expect(valkey.incrCalls).toBe(before);
    });

    it('releases the block and starts a fresh window once the window elapses', async () => {
      for (let index = 0; index < 3; index += 1) {
        await storage.increment('key-d', 60_000, 2, 30_000, 'auth');
      }
      expect((await storage.increment('key-d', 60_000, 2, 30_000, 'auth')).isBlocked).toBe(true);

      advance(61_000);
      const record = await storage.increment('key-d', 60_000, 2, 30_000, 'auth');

      expect(record.isBlocked).toBe(false);
      expect(record.totalHits).toBe(1);
      expect(record.timeToExpire).toBe(60);
    });

    it('re-blocks a request that arrives after the block but inside the same window', async () => {
      for (let index = 0; index < 3; index += 1) {
        await storage.increment('key-i', 60_000, 2, 30_000, 'auth');
      }
      expect((await storage.increment('key-i', 60_000, 2, 30_000, 'auth')).isBlocked).toBe(true);

      advance(31_000);
      const record = await storage.increment('key-i', 60_000, 2, 30_000, 'auth');

      expect(record.isBlocked).toBe(true);
      expect(record.totalHits).toBe(4);
    });

    it('resets the window when the tier has no block duration', async () => {
      await storage.increment('key-e', 60_000, 2, 0, 'default');
      await storage.increment('key-e', 60_000, 2, 0, 'default');
      const record: ValkeyThrottlerStorageRecord = await storage.increment('key-e', 60_000, 2, 0, 'default');

      expect(record.isBlocked).toBe(true);
      expect(record.totalHits).toBe(3);
      expect(valkey.strings.has('throttle:block:default:key-e')).toBe(false);
      expect(valkey.strings.has('throttle:hits:default:key-e')).toBe(false);

      const afterReset = await storage.increment('key-e', 60_000, 2, 0, 'default');
      expect(afterReset.totalHits).toBe(1);
      expect(afterReset.isBlocked).toBe(false);
    });
  });

  describe('fail-open to in-memory counters', () => {
    it('delegates to the in-memory storage when Valkey is unreachable', async () => {
      valkey.available = false;

      const record = await storage.increment('key-f', 60_000, 1, 60_000, 'default');
      expect(record.totalHits).toBe(1);
      expect(record.isBlocked).toBe(false);

      const blocked = await storage.increment('key-f', 60_000, 1, 60_000, 'default');
      expect(blocked.isBlocked).toBe(true);
    });

    it('the in-memory fallback resets the window instead of blocking when blockDuration is 0', async () => {
      valkey.available = false;

      await storage.increment('key-j', 60_000, 1, 0, 'default');
      const second = await storage.increment('key-j', 60_000, 1, 0, 'default');

      expect(second.isBlocked).toBe(false);
      expect(second.totalHits).toBe(1);
    });

    it('uses the supplied fallback instance, not a private one', async () => {
      const custom: ThrottlerStorage = {
        increment: vi.fn().mockResolvedValue({
          totalHits: 42,
          timeToExpire: 7,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      };
      valkey.available = false;
      const withCustom = new ValkeyThrottlerStorage(valkey as unknown as ValkeyService, { fallback: custom });

      await expect(withCustom.increment('key-g', 60_000, 1, 0, 'default')).resolves.toEqual({
        totalHits: 42,
        timeToExpire: 7,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
      expect(custom.increment).toHaveBeenCalledTimes(1);
    });

    it('degrades to the in-memory storage when a Valkey command throws mid-flight', async () => {
      const failing: ValkeyService = {
        ping: async () => 'PONG',
        get: async () => {
          throw new Error('connection reset');
        },
        set: async () => undefined,
        del: async () => undefined,
        incr: async () => 1,
        incrWithTtl: async () => 1,
        expire: async () => undefined,
      } as unknown as ValkeyService;
      const degraded = new ValkeyThrottlerStorage(failing, { fallback, now: () => now });

      const record = await degraded.increment('key-h', 60_000, 5, 0, 'default');
      expect(record.totalHits).toBe(1);
      await expect(degraded.isAvailable()).resolves.toBe(false);
    });
  });

  describe('loud degradation to per-process counters', () => {
    // The trade-off is deliberate: failing closed on a Valkey outage would take the whole
    // API down. The cost is that the effective limit becomes per replica, which is
    // invisible unless the degradation is announced.
    it('says "not exercised yet" before the first probe', () => {
      expect(storage.health()).toEqual({
        storage: 'in-memory-fallback',
        probed: false,
        degradation: {
          degraded: false,
          degradationId: null,
          degradedSinceMs: null,
          degradedEvents: 0,
          degradationCount: 0,
        },
      });
    });

    it('reports a healthy store after a successful probe', async () => {
      await storage.isAvailable();

      expect(storage.health().storage).toBe('valkey');
      expect(storage.health().probed).toBe(true);
      expect(storage.health().degradation.degraded).toBe(false);
    });

    it('warns once, with a correlation id and the security impact', async () => {
      valkey.available = false;

      await storage.increment('key-k', 60_000, 5, 0, 'default');
      await storage.increment('key-k', 60_000, 5, 0, 'default');
      await storage.increment('key-k', 60_000, 5, 0, 'default');

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const message = String(logger.warn.mock.calls[0]?.[0]);
      expect(message).toContain('DEGRADED');
      expect(message).toContain('degradationId=');
      expect(message).toContain('multiplied by the number of processes');
      expect(message).toContain('ValkeyThrottlerStorage');
    });

    it('reports the degradation with a stable id for the whole outage', async () => {
      valkey.available = false;
      await storage.increment('key-l', 60_000, 5, 0, 'default');
      const first = storage.health().degradation.degradationId;

      await storage.increment('key-l', 60_000, 5, 0, 'default');

      expect(first).not.toBeNull();
      expect(storage.health().degradation.degradationId).toBe(first);
      expect(storage.health().degradation.degradedEvents).toBe(2);
      expect(storage.health().degradation.degradationCount).toBe(1);
      expect(storage.health().storage).toBe('in-memory-fallback');
    });

    it('closes the episode with one INFO when Valkey comes back', async () => {
      valkey.available = false;
      await storage.increment('key-m', 60_000, 5, 0, 'default');

      valkey.available = true;
      advance(10_000);
      await storage.increment('key-m', 60_000, 5, 0, 'default');

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(String(logger.info.mock.calls[0]?.[0])).toContain('recovered to shared Valkey counters');
      expect(storage.health().degradation.degraded).toBe(false);
      expect(storage.health().storage).toBe('valkey');
    });

    it('keeps counting episodes after recovery so an alert can see the history', async () => {
      valkey.available = false;
      await storage.increment('key-n', 60_000, 5, 0, 'default');
      valkey.available = true;
      advance(10_000);
      await storage.increment('key-n', 60_000, 5, 0, 'default');
      valkey.available = false;
      advance(10_000);
      await storage.increment('key-n', 60_000, 5, 0, 'default');

      expect(storage.health().degradation.degradationCount).toBe(2);
    });

    it('degrades when a mid-flight command throws, not only when the probe fails', async () => {
      const failingLogger = recordingSink();
      const failing: ValkeyService = {
        ping: async () => 'PONG',
        get: async () => {
          throw new Error('connection reset');
        },
        set: async () => undefined,
        del: async () => undefined,
        incr: async () => 1,
        incrWithTtl: async () => 1,
        expire: async () => undefined,
      } as unknown as ValkeyService;
      const degraded = new ValkeyThrottlerStorage(failing, {
        fallback,
        now: () => now,
        logger: failingLogger,
      });

      await degraded.increment('key-o', 60_000, 5, 0, 'default');

      expect(failingLogger.warn).toHaveBeenCalledTimes(1);
      expect(String(failingLogger.warn.mock.calls[0]?.[0])).toContain('increment threw');
      expect(degraded.health().storage).toBe('in-memory-fallback');
      expect(degraded.health().degradation.degraded).toBe(true);
    });
  });

  describe('cross-instance visibility', () => {
    it('shares counters between two storage instances backed by the same Valkey', async () => {
      const second = new ValkeyThrottlerStorage(valkey as unknown as ValkeyService, {
        fallback,
        availabilityProbeIntervalMs: 0,
        now: () => now,
      });
      valkey.syncClock(now);

      await storage.increment('shared-key', 60_000, 3, 0, 'default');
      const record = await second.increment('shared-key', 60_000, 3, 0, 'default');

      expect(record.totalHits).toBe(2);
    });

    it('propagates a block set by one instance to the other', async () => {
      const second = new ValkeyThrottlerStorage(valkey as unknown as ValkeyService, {
        fallback,
        availabilityProbeIntervalMs: 0,
        now: () => now,
      });

      for (let index = 0; index < 2; index += 1) {
        await storage.increment('cross', 60_000, 1, 30_000, 'upload');
      }
      const record = await second.increment('cross', 60_000, 1, 30_000, 'upload');

      expect(record.isBlocked).toBe(true);
      expect(record.timeToBlockExpire).toBe(30);
    });
  });
});
