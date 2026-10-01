import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';

import { ValkeyService } from '../services/valkey.service.ts';
import { DegradationTracker } from '../observability/degradation.ts';
import type { DegradationSink, DegradationSnapshot } from '../observability/degradation.ts';
import { generateCorrelationId } from '../waf/headers.ts';

export interface ValkeyThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const HITS_PREFIX = 'throttle:hits';
const BLOCK_PREFIX = 'throttle:block';

const LOG_CONTEXT = 'ValkeyThrottlerStorage';

/**
 * Adapter for the default sink. Nest's `Logger` is used rather than `console` because
 * `main.ts` hands the Winston pipeline to `NestFactory.create({ logger })`, so this
 * output lands in the same stream as everything else. Typed to `DegradationSink` so the
 * tracker does not depend on a concrete logger.
 */
function nestLoggerSink(context: string): DegradationSink {
  const logger = new Logger(context);
  return {
    warn: (message, sinkContext) => logger.warn(message, sinkContext),
    info: (message, sinkContext) => logger.log(message, sinkContext),
  };
}

/**
 * What an attacker actually gains while the limiter is degraded. Spelled out so the
 * WARN line an operator alerts on explains the risk instead of saying "degraded".
 */
const DEGRADED_SECURITY_IMPACT =
  'The limiter still runs, but counters are per process instead of shared, so a budget is not shared ' +
  'across replicas and the effective limit is multiplied by the number of processes.';

export interface ValkeyThrottlerStorageOptions {
  readonly fallback?: ThrottlerStorage;
  readonly availabilityProbeIntervalMs?: number;
  readonly now?: () => number;
  /**
   * The injected application logger (Principle #2). Optional so the class stays
   * constructible in isolation; when absent a Nest `Logger` adapter is used, which
   * `main.ts` has already bound to the same Winston pipeline via
   * `NestFactory.create(..., { logger: new WinstonLoggerService() })`. Either path goes
   * through the application logging stack, never `console`.
   */
  readonly logger?: DegradationSink;
}

/**
 * The signal a production deployment can alert on, and the payload served by
 * `GET /api/v1/metrics/degradation`.
 */
export interface ThrottlerStorageHealth {
  /**
   * What the NEXT increment will count in. Defaults to the pessimistic answer: until a
   * probe has succeeded, the worst case is what an operator needs to plan for.
   */
  readonly storage: 'valkey' | 'in-memory-fallback';
  /**
   * False until the first availability probe has run, so "not exercised yet" is
   * distinguishable from "exercised and broken". `degradationCount === 0` together
   * with `probed === true` means healthy.
   */
  readonly probed: boolean;
  readonly degradation: DegradationSnapshot;
}

function hitsKey(throttlerName: string, key: string): string {
  return `${HITS_PREFIX}:${throttlerName}:${key}`;
}

function blockKey(throttlerName: string, key: string): string {
  return `${BLOCK_PREFIX}:${throttlerName}:${key}`;
}

function toSeconds(milliseconds: number): number {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

function parseEpoch(raw: string | null, fallback: number): number {
  if (raw === null) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * MUST BE REGISTERED WITH AN EXPLICIT FACTORY, never as a bare class provider. The
 * second constructor argument is a plain options object (`fallback`, probe interval,
 * clock, logger), which Nest cannot inject; listing the class directly produces
 * "Nest can't resolve dependencies … index [1]". `CommonModule` therefore registers it
 * under `getStorageToken()` via `useFactory`.
 */
@Injectable()
export class ValkeyThrottlerStorage implements ThrottlerStorage {
  private readonly fallbackLogger: DegradationSink;
  private readonly fallback: ThrottlerStorage;
  private readonly probeIntervalMs: number;
  private readonly now: () => number;
  private readonly degradation: DegradationTracker;
  private available = false;
  private probed = false;
  private nextProbeAt = 0;

  constructor(
    private readonly valkey: ValkeyService,
    options: ValkeyThrottlerStorageOptions = {},
  ) {
    this.fallback = options.fallback ?? new ThrottlerStorageService();
    this.probeIntervalMs = options.availabilityProbeIntervalMs ?? 5000;
    this.now = options.now ?? (() => Date.now());
    this.fallbackLogger = options.logger ?? nestLoggerSink(LOG_CONTEXT);
    this.degradation = new DegradationTracker(this.fallbackLogger, generateCorrelationId, this.now);
  }

  /**
   * Last known health. Deliberately does not probe Valkey: it is cheap enough to scrape
   * on every request to the admin metrics endpoint.
   */
  health(): ThrottlerStorageHealth {
    return {
      storage: this.available ? 'valkey' : 'in-memory-fallback',
      probed: this.probed,
      degradation: this.degradation.snapshot(),
    };
  }

  async isAvailable(): Promise<boolean> {
    const current = this.now();
    if (this.available && current < this.nextProbeAt) {
      return true;
    }
    if (!this.available && current < this.nextProbeAt) {
      return false;
    }
    this.probed = true;
    try {
      const pong = await this.valkey.ping();
      if (pong === 'PONG') {
        this.available = true;
        this.degradation.leave(LOG_CONTEXT, 'shared Valkey counters');
      } else {
        this.available = false;
        this.degradation.enter(LOG_CONTEXT, `ping returned ${String(pong)}`, DEGRADED_SECURITY_IMPACT);
      }
    } catch (error) {
      this.available = false;
      this.degradation.enter(LOG_CONTEXT, 'ping threw', DEGRADED_SECURITY_IMPACT, error);
    }
    this.nextProbeAt = current + this.probeIntervalMs;
    return this.available;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ValkeyThrottlerStorageRecord> {
    if (!(await this.isAvailable())) {
      this.degradation.countEvent();
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    try {
      return await this.incrementInValkey(key, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      this.available = false;
      this.nextProbeAt = this.now() + this.probeIntervalMs;
      this.degradation.enter(LOG_CONTEXT, 'increment threw', DEGRADED_SECURITY_IMPACT, error);
      this.degradation.countEvent();
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  private async incrementInValkey(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ValkeyThrottlerStorageRecord> {
    const now = this.now();
    const ttlSeconds = toSeconds(ttl);

    const blockRaw = await this.valkey.get(blockKey(throttlerName, key));
    if (blockRaw !== null) {
      const blockExpiresAt = parseEpoch(blockRaw, 0);
      if (blockExpiresAt > now) {
        const currentHits = parseEpoch(await this.valkey.get(hitsKey(throttlerName, key)), 0);
        return {
          totalHits: currentHits,
          timeToExpire: ttlSeconds,
          isBlocked: true,
          timeToBlockExpire: toSeconds(blockExpiresAt - now),
        };
      }
      await this.valkey.del(blockKey(throttlerName, key));
    }

    const counterKey = hitsKey(throttlerName, key);
    // Atomic increment-with-TTL. Two separate commands leave a window in which the counter key
    // exists with no expiry; since it only rises, a key that lost its TTL would never reset and
    // the caller would stay blocked for ever. See ValkeyService.incrWithTtl.
    const totalHits =
      ttlSeconds > 0 ? await this.valkey.incrWithTtl(counterKey, ttlSeconds) : await this.valkey.incr(counterKey);
    let timeToExpire = ttlSeconds;
    if (totalHits > 1) {
      const remaining = await this.valkey.ttl(counterKey);
      if (remaining > 0) {
        timeToExpire = remaining;
      }
    }

    if (totalHits > limit) {
      const timeToBlockExpire = toSeconds(Math.max(0, blockDuration));
      if (blockDuration > 0) {
        await this.valkey.set(blockKey(throttlerName, key), String(now + blockDuration), timeToBlockExpire);
      } else {
        await this.valkey.del(counterKey);
      }
      return { totalHits, timeToExpire, isBlocked: true, timeToBlockExpire };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
