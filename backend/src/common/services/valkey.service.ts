import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(ValkeyService.name);

  async onModuleInit() {
    try {
      const host = process.env.VALKEY_HOST || process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.VALKEY_PORT || process.env.REDIS_PORT || '6379', 10);
      const password = process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || undefined;

      this.client = new Redis({
        host,
        port,
        password,
      });

      await this.client.ping();
      this.logger.log('Valkey connected');
    } catch (error) {
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
}
