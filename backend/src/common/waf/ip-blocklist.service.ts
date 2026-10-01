import { Injectable } from '@nestjs/common';

import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

export type BlockKind = 'temporary' | 'permanent';

export interface BlockRecord {
  readonly ip: string;
  readonly kind: BlockKind;
  readonly reason: string;
  readonly ruleId: string | null;
  readonly blockedAt: number;
  readonly expiresAt: number | null;
}

export interface BlockOptions {
  readonly reason: string;
  readonly ruleId?: string | null;
  readonly kind: BlockKind;
  readonly ttlSeconds?: number;
  readonly now?: number;
}

const KEY_PREFIX = 'waf:ip-blocked';
const INDEX_KEY = `${KEY_PREFIX}:index`;
const VIOLATION_PREFIX = 'waf:ip-violations';

function blockKey(ip: string): string {
  return `${KEY_PREFIX}:${ip}`;
}

function violationKey(ip: string): string {
  return `${VIOLATION_PREFIX}:${ip}`;
}

function parseBlockRecord(ip: string, raw: string): BlockRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as {
    kind?: unknown;
    reason?: unknown;
    ruleId?: unknown;
    blockedAt?: unknown;
    expiresAt?: unknown;
  };
  return {
    ip,
    kind: record.kind === 'permanent' ? 'permanent' : 'temporary',
    reason: typeof record.reason === 'string' ? record.reason : 'unreadable-block-record',
    ruleId: typeof record.ruleId === 'string' ? record.ruleId : null,
    blockedAt: typeof record.blockedAt === 'number' ? record.blockedAt : 0,
    expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : null,
  };
}

/**
 * Cheap last-known health of the blocklist store, for `GET /api/v1/metrics/degradation`.
 *
 * `available` is `null` until the first operation, so "not yet exercised" is
 * distinguishable from "exercised and broken". `consecutiveFailures` is the number a
 * deployment alerts on: while it is above zero, no IP can be blocked and no violation
 * can be escalated.
 */
export interface IpBlocklistHealth {
  readonly available: boolean | null;
  readonly consecutiveFailures: number;
  readonly lastFailureAtMs: number | null;
}

@Injectable()
export class IpBlocklistService {
  private consecutiveFailures = 0;
  private lastFailureAtMs: number | null = null;
  private lastKnownAvailable: boolean | null = null;

  constructor(
    private readonly valkey: ValkeyService,
    private readonly logger: WinstonLoggerService,
  ) {}

  health(): IpBlocklistHealth {
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

  private noteStoreFailure(): void {
    this.lastKnownAvailable = false;
    this.consecutiveFailures += 1;
    this.lastFailureAtMs = Date.now();
  }

  async isStorageAvailable(): Promise<boolean> {
    try {
      const available = (await this.valkey.ping()) === 'PONG';
      this.noteStoreReachable();
      return available;
    } catch {
      this.noteStoreFailure();
      return false;
    }
  }

  async block(ip: string, options: BlockOptions): Promise<boolean> {
    const now = options.now ?? Date.now();
    const kind: BlockKind = options.kind;
    const ttlSeconds = kind === 'permanent' ? undefined : (options.ttlSeconds ?? 3600);
    const payload: BlockRecord = {
      ip,
      kind,
      reason: options.reason,
      ruleId: options.ruleId ?? null,
      blockedAt: now,
      expiresAt: ttlSeconds === undefined ? null : now + ttlSeconds * 1000,
    };

    try {
      await this.valkey.set(blockKey(ip), JSON.stringify(payload), ttlSeconds);
      await this.valkey.sadd(INDEX_KEY, ip);
      this.noteStoreReachable();
      this.logger.warn(
        `WAF IP blocklist: ${ip} blocked (${kind}) reason=${options.reason} rule=${options.ruleId ?? 'n/a'} ttl=${ttlSeconds ?? 'none'}s`,
        'IpBlocklistService',
      );
      return true;
    } catch (error) {
      this.noteStoreFailure();
      this.logger.error(`WAF IP blocklist: failed to block ${ip}: ${String(error)}`, undefined, 'IpBlocklistService');
      return false;
    }
  }

  async isBlocked(ip: string): Promise<BlockRecord | null> {
    if (ip.length === 0) {
      return null;
    }
    try {
      const raw = await this.valkey.get(blockKey(ip));
      this.noteStoreReachable();
      if (raw === null) {
        return null;
      }
      return (
        parseBlockRecord(ip, raw) ?? {
          ip,
          kind: 'temporary' as const,
          reason: 'unreadable-block-record',
          ruleId: null,
          blockedAt: 0,
          expiresAt: null,
        }
      );
    } catch (error) {
      this.noteStoreFailure();
      this.logger.error(`WAF IP blocklist: lookup failed for ${ip}: ${String(error)}`, undefined, 'IpBlocklistService');
      return null;
    }
  }

  async unblock(ip: string): Promise<boolean> {
    try {
      const removed = await this.valkey.exists(blockKey(ip));
      await this.valkey.del(blockKey(ip));
      await this.valkey.srem(INDEX_KEY, ip);
      await this.valkey.del(violationKey(ip));
      this.logger.warn(`WAF IP blocklist: ${ip} unblocked (wasBlocked=${String(removed)})`, 'IpBlocklistService');
      return removed;
    } catch (error) {
      this.logger.error(`WAF IP blocklist: failed to unblock ${ip}: ${String(error)}`, undefined, 'IpBlocklistService');
      return false;
    }
  }

  async listBlocked(): Promise<BlockRecord[]> {
    try {
      const ips = await this.valkey.smembers(INDEX_KEY);
      const records: BlockRecord[] = [];
      for (const ip of ips) {
        const record = await this.isBlocked(ip);
        if (record === null) {
          await this.valkey.srem(INDEX_KEY, ip);
          continue;
        }
        records.push(record);
      }
      return records;
    } catch (error) {
      this.logger.error(`WAF IP blocklist: listing failed: ${String(error)}`, undefined, 'IpBlocklistService');
      return [];
    }
  }

  async countViolations(ip: string): Promise<number> {
    try {
      const raw = await this.valkey.get(violationKey(ip));
      if (raw === null) {
        return 0;
      }
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }

  async recordViolation(ip: string, windowSeconds: number, now?: number): Promise<number> {
    const current = now ?? Date.now();
    try {
      const key = violationKey(ip);
      // Atomic increment-with-TTL. A plain INCR followed by a conditional EXPIRE leaves a window
      // in which the key exists with no expiry; because this counter only ever rises, a key that
      // lost its TTL would keep climbing and eventually block a real user permanently, with no
      // automatic recovery. See ValkeyService.incrWithTtl.
      const count = await this.valkey.incrWithTtl(key, windowSeconds);
      this.noteStoreReachable();
      if (count === 0) {
        // A count of 0 means the script ran but the store was unreachable, which is
        // indistinguishable from "counted nothing" to a caller that does not read the logs.
        // That matters because this method feeds the escalation ladder: a 0 means the IP will
        // never reach the temporary or permanent threshold for as long as Valkey is down.
        this.noteStoreFailure();
        this.logger.error(
          `WAF IP blocklist: violation counter unavailable for ${ip} (at ${current})`,
          undefined,
          'IpBlocklistService',
        );
        return 0;
      }
      return count;
    } catch (error) {
      // Returning 0 is indistinguishable from "counted nothing" to a caller that does
      // not read the logs, and the caller is the escalation ladder: a 0 means this IP
      // will never reach the temporary or permanent block threshold for as long as Valkey
      // is down. The WAF middleware turns a falsy result into a degradation alert.
      this.noteStoreFailure();
      this.logger.error(
        `WAF IP blocklist: failed to record violation for ${ip}: ${String(error)} (at ${current})`,
        undefined,
        'IpBlocklistService',
      );
      return 0;
    }
  }

  async clearViolations(ip: string): Promise<void> {
    try {
      await this.valkey.del(violationKey(ip));
    } catch (error) {
      this.logger.error(
        `WAF IP blocklist: failed to clear violations for ${ip}: ${String(error)}`,
        undefined,
        'IpBlocklistService',
      );
    }
  }
}
