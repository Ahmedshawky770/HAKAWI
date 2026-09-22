import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { WinstonLoggerService } from './winston-logger.service.js';

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: WinstonLoggerService,
  ) {
    this.client = new Redis({
      host: this.configService.get<string>('valkey.host'),
      port: this.configService.get<number>('valkey.port'),
      password: this.configService.get<string>('valkey.password'),
    });
  }

  async onModuleInit() {
    try {
      await this.client.ping();
      this.logger.log('Valkey connected', 'ValkeyService');
    } catch (error) {
      this.logger.error('Failed to connect to Valkey', (error as Error)?.stack, 'ValkeyService');
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Valkey disconnected', 'ValkeyService');
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl);
  }
}
