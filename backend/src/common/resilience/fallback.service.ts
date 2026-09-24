import { Injectable, Logger } from '@nestjs/common';

import { ValkeyService } from '../services/valkey.service.js';

export type FallbackStrategy<T> = (error: unknown, context?: unknown) => Promise<T> | T;

export interface FallbackConfig<T> {
  strategy: FallbackStrategy<T>;
  context?: unknown;
}

@Injectable()
export class FallbackService {
  private readonly logger = new Logger(FallbackService.name);

  constructor(private readonly valkeyService: ValkeyService) {}

  async returnDefault<T>(defaultValue: T): Promise<T> {
    return defaultValue;
  }

  async returnCached<T>(key: string): Promise<T | null> {
    const cached = await this.valkeyService.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  async returnNull<T>(): Promise<T | null> {
    return null;
  }

  async throwCustomError<T>(error: Error): Promise<T> {
    throw error;
  }

  async executeWithFallback<T>(fn: () => Promise<T>, config: FallbackConfig<T>, fallbackKey?: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Fallback triggered for operation: ${String(error)}`, FallbackService.name);
      if (fallbackKey) {
        const cached = await this.returnCached<T>(fallbackKey);
        if (cached !== null) {
          return cached;
        }
      }
      return config.strategy(error, config.context);
    }
  }
}
