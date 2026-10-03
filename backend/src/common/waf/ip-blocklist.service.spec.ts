import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import { IpBlocklistService } from './ip-blocklist.service.ts';

class FakeValkey {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  ttls = new Map<string, number>();
  available = true;
  failOn = new Set<string>();

  private guard(op: string): void {
    if (this.failOn.has(op)) {
      throw new Error(`${op} failed`);
    }
  }

  async get(key: string): Promise<string | null> {
    this.guard('get');
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.guard('set');
    this.strings.set(key, value);
    if (ttl !== undefined) {
      this.ttls.set(key, ttl);
    } else {
      this.ttls.delete(key);
    }
  }

  async del(key: string): Promise<void> {
    this.guard('del');
    this.strings.delete(key);
    this.ttls.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    this.guard('exists');
    return this.strings.has(key);
  }

  async incr(key: string): Promise<number> {
    this.guard('incr');
    const next = Number.parseInt(this.strings.get(key) ?? '0', 10) + 1;
    this.strings.set(key, String(next));
    return next;
  }

  /**
   * Mirrors the real Lua script: the counter and its TTL are established in one atomic step,
   * and the TTL is NOT refreshed on subsequent hits. Modelling that here is what lets the
   * "the window must not slide forever" assertions below mean anything.
   */
  async incrWithTtl(key: string, ttl: number): Promise<number> {
    this.guard('incrWithTtl');
    if (!this.strings.has(key)) {
      this.strings.set(key, '0');
      this.ttls.set(key, ttl);
    }
    const next = Number.parseInt(this.strings.get(key) ?? '0', 10) + 1;
    this.strings.set(key, String(next));
    return next;
  }

  async expire(key: string, ttl: number): Promise<void> {
    this.guard('expire');
    this.ttls.set(key, ttl);
  }

  async sadd(key: string, member: string): Promise<number> {
    this.guard('sadd');
    const set = this.sets.get(key) ?? new Set<string>();
    const size = set.size;
    set.add(member);
    this.sets.set(key, set);
    return set.size === size ? 0 : 1;
  }

  async smembers(key: string): Promise<string[]> {
    this.guard('smembers');
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async srem(key: string, member: string): Promise<number> {
    this.guard('srem');
    const set = this.sets.get(key);
    if (!set) {
      return 0;
    }
    const removed = set.delete(member);
    return removed ? 1 : 0;
  }

  async ping(): Promise<string> {
    if (!this.available) {
      throw new Error('Valkey client not initialized');
    }
    return 'PONG';
  }

  simulateExpiry(key: string): void {
    this.strings.delete(key);
    this.ttls.delete(key);
  }
}

type MockLogger = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

describe('IpBlocklistService', () => {
  let valkey: FakeValkey;
  let logger: MockLogger;
  let service: IpBlocklistService;

  beforeEach(() => {
    valkey = new FakeValkey();
    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
    service = new IpBlocklistService(valkey as unknown as ValkeyService, logger as unknown as WinstonLoggerService);
  });

  describe('isStorageAvailable', () => {
    it('reports available when ping succeeds', async () => {
      await expect(service.isStorageAvailable()).resolves.toBe(true);
    });

    it('reports unavailable when ping fails', async () => {
      valkey.available = false;
      await expect(service.isStorageAvailable()).resolves.toBe(false);
    });
  });

  describe('store health, the signal an operator alerts on', () => {
    it('says "not exercised yet" before the first operation', () => {
      expect(service.health()).toEqual({ available: null, consecutiveFailures: 0, lastFailureAtMs: null });
    });

    it('counts consecutive failures while the store is unreachable', async () => {
      valkey.failOn.add('get');

      await service.isBlocked('203.0.113.5');
      await service.isBlocked('203.0.113.5');

      const health = service.health();
      expect(health.available).toBe(false);
      expect(health.consecutiveFailures).toBe(2);
      expect(health.lastFailureAtMs).not.toBeNull();
    });

    it('resets the counter once the store recovers', async () => {
      valkey.failOn.add('get');
      await service.isBlocked('203.0.113.5');
      valkey.failOn.clear();

      await service.isBlocked('203.0.113.5');

      expect(service.health()).toMatchObject({ available: true, consecutiveFailures: 0 });
    });

    it('counts a failed block write as a failure, not just a failed read', async () => {
      valkey.failOn.add('set');

      await service.block('203.0.113.5', { kind: 'permanent', reason: 'test' });

      expect(service.health().available).toBe(false);
    });

    it('counts a failed violation write, which is what stops the escalation ladder', async () => {
      valkey.failOn.add('incrWithTtl');

      // Returns 0 rather than throwing, so the caller has to notice. The WAF middleware
      // does notice and raises a degradation warning.
      await expect(service.recordViolation('203.0.113.5', 900)).resolves.toBe(0);
      expect(service.health().consecutiveFailures).toBe(1);
    });

    it('returns a positive count on a successful violation write', async () => {
      await expect(service.recordViolation('203.0.113.5', 900)).resolves.toBe(1);
      expect(service.health().available).toBe(true);
    });
  });

  describe('temporary blocks', () => {
    it('stores a temporary block with a TTL and indexes the IP', async () => {
      const blocked = await service.block('203.0.113.5', {
        kind: 'temporary',
        ttlSeconds: 120,
        reason: 'repeated-violations:xss-script-tag',
        ruleId: 'xss-script-tag',
        now: 1_000,
      });

      expect(blocked).toBe(true);
      expect(valkey.ttls.get('waf:ip-blocked:203.0.113.5')).toBe(120);
      expect(valkey.sets.get('waf:ip-blocked:index')?.has('203.0.113.5')).toBe(true);
    });

    it('records an absolute expiry so the caller can report the unblock time', async () => {
      await service.block('203.0.113.5', { kind: 'temporary', ttlSeconds: 60, reason: 'r', now: 1_000 });
      const record = await service.isBlocked('203.0.113.5');

      expect(record).toEqual({
        ip: '203.0.113.5',
        kind: 'temporary',
        reason: 'r',
        ruleId: null,
        blockedAt: 1_000,
        expiresAt: 61_000,
      });
    });

    it('auto-unblocks once the Valkey TTL elapses', async () => {
      await service.block('203.0.113.5', { kind: 'temporary', ttlSeconds: 60, reason: 'r' });
      expect(await service.isBlocked('203.0.113.5')).not.toBeNull();

      valkey.simulateExpiry('waf:ip-blocked:203.0.113.5');
      expect(await service.isBlocked('203.0.113.5')).toBeNull();
    });

    it('falls back to a default TTL when none is supplied', async () => {
      await service.block('203.0.113.6', { kind: 'temporary', reason: 'r' });
      expect(valkey.ttls.get('waf:ip-blocked:203.0.113.6')).toBe(3600);
    });

    it('reports a failure instead of throwing when the store is down', async () => {
      valkey.failOn.add('set');
      await expect(service.block('203.0.113.7', { kind: 'temporary', reason: 'r' })).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('permanent blocks', () => {
    it('stores a permanent block with no TTL', async () => {
      await service.block('198.51.100.2', {
        kind: 'permanent',
        reason: 'critical:sql-tautology',
        ruleId: 'sql-tautology',
        now: 5_000,
      });

      expect(valkey.ttls.has('waf:ip-blocked:198.51.100.2')).toBe(false);
      const record = await service.isBlocked('198.51.100.2');
      expect(record?.kind).toBe('permanent');
      expect(record?.expiresAt).toBeNull();
      expect(record?.ruleId).toBe('sql-tautology');
    });

    it('never auto-unblocks', async () => {
      await service.block('198.51.100.2', { kind: 'permanent', reason: 'r' });
      valkey.simulateExpiry('waf:ip-blocked:198.51.100.2');
      valkey.strings.set('waf:ip-blocked:198.51.100.2', JSON.stringify({ reason: 'r' }));
      expect(await service.isBlocked('198.51.100.2')).not.toBeNull();
    });
  });

  describe('unblock', () => {
    it('removes the block and the index entry', async () => {
      await service.block('203.0.113.8', { kind: 'temporary', reason: 'r' });

      await expect(service.unblock('203.0.113.8')).resolves.toBe(true);
      expect(await service.isBlocked('203.0.113.8')).toBeNull();
      expect(valkey.sets.get('waf:ip-blocked:index')?.has('203.0.113.8')).toBe(false);
    });

    it('reports false for an IP that was never blocked', async () => {
      await expect(service.unblock('203.0.113.9')).resolves.toBe(false);
    });

    it('clears the violation counter for the IP', async () => {
      await service.recordViolation('203.0.113.9', 900);
      expect(await service.countViolations('203.0.113.9')).toBe(1);

      await service.unblock('203.0.113.9');
      expect(await service.countViolations('203.0.113.9')).toBe(0);
    });

    it('reports a failure instead of throwing when the store is down', async () => {
      valkey.failOn.add('del');
      await expect(service.unblock('203.0.113.9')).resolves.toBe(false);
    });
  });

  describe('listBlocked', () => {
    it('lists every currently blocked IP with its reason', async () => {
      await service.block('203.0.113.10', { kind: 'temporary', reason: 'a', ruleId: 'r1' });
      await service.block('198.51.100.20', { kind: 'permanent', reason: 'b', ruleId: 'r2' });

      const records = await service.listBlocked();
      expect(records.map((record) => record.ip).sort()).toEqual(['198.51.100.20', '203.0.113.10']);
      expect(records.find((record) => record.ip === '203.0.113.10')?.reason).toBe('a');
    });

    it('prunes stale index entries whose block already expired', async () => {
      await service.block('203.0.113.11', { kind: 'temporary', reason: 'a' });
      valkey.simulateExpiry('waf:ip-blocked:203.0.113.11');

      await expect(service.listBlocked()).resolves.toEqual([]);
      expect(valkey.sets.get('waf:ip-blocked:index')?.has('203.0.113.11')).toBe(false);
    });

    it('returns an empty list when the store is down', async () => {
      valkey.failOn.add('smembers');
      await expect(service.listBlocked()).resolves.toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('violation counters', () => {
    it('starts at zero', async () => {
      await expect(service.countViolations('203.0.113.12')).resolves.toBe(0);
    });

    it('increments and sets the window TTL only on the first violation', async () => {
      await service.recordViolation('203.0.113.12', 900);
      expect(valkey.ttls.get('waf:ip-violations:203.0.113.12')).toBe(900);

      valkey.ttls.delete('waf:ip-violations:203.0.113.12');
      await service.recordViolation('203.0.113.12', 900);
      // The TTL is not re-applied on a later hit, because SET … NX only fires when the key is
      // absent. Re-applying it would make the violation window slide forward on every request,
      // so a slow attacker could accumulate a permanent block total without ever tripping a
      // temporary block.
      expect(valkey.ttls.has('waf:ip-violations:203.0.113.12')).toBe(false);
    });

    it('establishes the counter and its TTL in one step, so a crash cannot orphan the key', async () => {
      // The reason this method exists. With INCR followed by a conditional EXPIRE, a process
      // death between the two leaves a counter that only ever rises and never expires, so this
      // IP eventually reaches violationsBeforePermanentBlock and is blocked for ever.
      await service.recordViolation('203.0.113.12', 900);
      expect(valkey.strings.has('waf:ip-violations:203.0.113.12')).toBe(true);
      expect(valkey.ttls.has('waf:ip-violations:203.0.113.12')).toBe(true);
    });

    it('keeps counting across repeated violations', async () => {
      await service.recordViolation('203.0.113.12', 900);
      await service.recordViolation('203.0.113.12', 900);
      await expect(service.countViolations('203.0.113.12')).resolves.toBe(2);
    });

    it('returns zero and logs when the store is down', async () => {
      valkey.failOn.add('incrWithTtl');
      await expect(service.recordViolation('203.0.113.12', 900)).resolves.toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('clearViolations resets the counter', async () => {
      await service.recordViolation('203.0.113.12', 900);
      await service.clearViolations('203.0.113.12');
      await expect(service.countViolations('203.0.113.12')).resolves.toBe(0);
    });

    it('clearViolations does not throw when the store is down', async () => {
      valkey.failOn.add('del');
      await expect(service.clearViolations('203.0.113.12')).resolves.toBeUndefined();
    });
  });

  describe('defensive parsing', () => {
    it('keeps the IP blocked when the stored payload is not JSON at all', async () => {
      valkey.strings.set('waf:ip-blocked:203.0.113.13', 'not json');
      const record = await service.isBlocked('203.0.113.13');

      expect(record?.kind).toBe('temporary');
      expect(record?.reason).toBe('unreadable-block-record');
    });
    it('keeps the IP blocked when the payload has no reason string', async () => {
      valkey.strings.set('waf:ip-blocked:203.0.113.14', JSON.stringify({ reason: 42 }));
      const record = await service.isBlocked('203.0.113.14');

      expect(record).toEqual({
        ip: '203.0.113.14',
        kind: 'temporary',
        reason: 'unreadable-block-record',
        ruleId: null,
        blockedAt: 0,
        expiresAt: null,
      });
    });

    it('returns null for an empty IP without touching the store', async () => {
      valkey.failOn.add('get');
      await expect(service.isBlocked('')).resolves.toBeNull();
    });

    it('returns null and logs when the lookup throws', async () => {
      valkey.failOn.add('get');
      await expect(service.isBlocked('203.0.113.15')).resolves.toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
