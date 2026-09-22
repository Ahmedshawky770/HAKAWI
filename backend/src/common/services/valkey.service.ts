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
}
