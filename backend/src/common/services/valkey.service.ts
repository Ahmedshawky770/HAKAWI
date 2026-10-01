import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Pipeline } from 'ioredis';

export const VALKEY_TTL_MISSING = -2;
export const VALKEY_TTL_PERSISTENT = -1;

function isPipeline(candidate: unknown): candidate is Pipeline {
  return (
    typeof candidate === 'object' && candidate !== null && 'isPipeline' in candidate && candidate.isPipeline === true
  );
}

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(ValkeyService.name);

  async onModuleInit() {
    try {
      const host = process.env.VALKEY_HOST || process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.VALKEY_PORT || process.env.REDIS_PORT || '6379', 10);
      const password = process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || undefined;

      const client = new Redis({
        host,
        port,
        password,
      });

      await client.ping();
      this.logger.log('Valkey connected');
      this.client = client;
    } catch (error) {
      this.client = null;
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error('Failed to connect to Valkey', errorMessage);
      if (process.env.NODE_ENV !== 'test') {
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Valkey disconnected');
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) {
      return;
    }
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    const result = await this.client.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    return this.client.incr(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.expire(key, ttl);
  }

  async ttl(key: string): Promise<number> {
    if (!this.client) {
      return VALKEY_TTL_MISSING;
    }
    return this.client.ttl(key);
  }

  async eval(script: string, keys: readonly string[], args: readonly string[] = []): Promise<unknown> {
    if (!this.client) {
      return null;
    }
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  async multi(): Promise<Pipeline> {
    if (!this.client) {
      throw new Error('Valkey client not initialized');
    }
    const transaction: unknown = this.client.multi();
    if (!isPipeline(transaction)) {
      throw new Error('Valkey multi() did not return a pipeline');
    }
    return transaction;
  }

  async ping(): Promise<string> {
    if (!this.client) {
      throw new Error('Valkey client not initialized');
    }
    return this.client.ping();
  }

  async sadd(key: string, member: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    return this.client.sadd(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    return this.client.smembers(key);
  }

  async srem(key: string, member: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    return this.client.srem(key, member);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    const result: string[] = [];
    let cursor = '0';
    do {
      const scanResult = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
      cursor = scanResult[0];
      result.push(...scanResult[1]);
    } while (cursor !== '0');
    return result;
  }

  async hSet(key: string, field: string, value: string): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.hset(key, field, value);
  }

  async hSetMultiple(key: string, values: Record<string, string>): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.hmset(key, values);
  }

  /**
   * Increment a counter and guarantee the key carries a TTL, atomically.
   *
   * The obvious two-command form — `INCR` then `if (count === 1) EXPIRE` — is not safe. If the
   * process dies or the connection drops between the two, the key exists with no expiry. For a
   * monotonically increasing counter that is permanent: the WAF violation counter would keep
   * climbing forever and eventually cross `violationsBeforePermanentBlock` at an arbitrary
   * future moment, blocking a real user with a key that never expires and no way to clear it
   * except direct Valkey manipulation. The same shape existed in the throttler storage.
   *
   * `SET key 0 EX ttl NX` establishes the counter and its TTL in one atomic step, and only
   * when the key is genuinely absent, so the window is not refreshed on every hit. `INCR` then
   * produces the new value. Both run server-side in one script, so no interleaving is possible.
   *
   * @returns the new counter value, or 0 when Valkey is unreachable.
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client) {
      return 0;
    }
    const result = await this.client.eval(COUNTER_WITH_TTL_SCRIPT, 1, key, String(ttlSeconds));
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return 0;
    }
    return result;
  }
}

/**
 * KEYS[1] is the counter, ARGV[1] is the TTL in seconds.
 * Returns the counter's value after incrementing.
 */
const COUNTER_WITH_TTL_SCRIPT = `
local ttl = tonumber(ARGV[1])
redis.call('SET', KEYS[1], '0', 'EX', ttl, 'NX')
return redis.call('INCR', KEYS[1])
`;
