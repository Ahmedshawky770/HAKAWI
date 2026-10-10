import { Injectable, Logger } from '@nestjs/common';
import type { ZodType } from 'zod';

import { fetchJson, isRetryableFetchError, type FetchJsonBody } from '../utils/fetch.util.ts';

import { CircuitBreakerService } from './circuit-breaker.service.ts';
import { RetryService, type RetryConfig } from './retry.service.ts';
import { TimeoutService } from './timeout.service.ts';
import { FallbackService } from './fallback.service.ts';

export interface ResilientFetchOptions<T> {
  readonly circuitName: string;
  readonly timeoutMs: number;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: FetchJsonBody;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly fallback?: () => Promise<T> | T;
  readonly fallbackKey?: string;
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
  readonly retryConfig?: Partial<RetryConfig>;
}

@Injectable()
export class ResilientHttpClient {
  private readonly logger = new Logger(ResilientHttpClient.name);

  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly retry: RetryService,
    private readonly timeout: TimeoutService,
    private readonly fallbackService: FallbackService,
  ) {}

  async request<T>(url: string, schema: ZodType<T>, options: ResilientFetchOptions<T>): Promise<T> {
    const operation = `external-call:${options.circuitName}`;
    const fallback = options.fallback;

    const attempt = (): Promise<T> =>
      this.timeout.executeWithTimeout(
        operation,
        () =>
          fetchJson<T>(url, schema, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: options.signal,
            fetchImpl: options.fetchImpl,
            operation,
            timeoutMs: options.timeoutMs,
          }),
        options.timeoutMs,
      );

    const withCircuitBreaker = (): Promise<T> => this.circuitBreaker.execute<T>(options.circuitName, attempt);

    const shouldRetry = options.shouldRetry ?? isRetryableFetchError;

    const withRetries = (): Promise<T> =>
      options.retryConfig === undefined
        ? this.retry.execute(operation, withCircuitBreaker, shouldRetry)
        : this.retry.executeWithBackoff(operation, withCircuitBreaker, options.retryConfig, shouldRetry);

    try {
      return await withRetries();
    } catch (error) {
      if (options.fallbackKey !== undefined) {
        const cached = await this.fallbackService.returnCached<T>(options.fallbackKey);
        if (cached !== null) {
          this.logger.warn(`${operation} served from stale cache key=${options.fallbackKey}`, ResilientHttpClient.name);
          return cached;
        }
      }
      if (fallback) {
        this.logger.warn(`${operation} served from the configured fallback`, ResilientHttpClient.name);
        return fallback();
      }
      this.logger.error(`${operation} failed permanently: ${String(error)}`, undefined, ResilientHttpClient.name);
      throw error;
    }
  }
}
