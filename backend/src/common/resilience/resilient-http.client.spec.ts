import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

import { ValkeyService } from '../services/valkey.service.ts';
import { FetchResponseError, FetchValidationError, type FetchJsonBody } from '../utils/fetch.util.ts';

import { CircuitBreakerService } from './circuit-breaker.service.ts';
import { RetryService } from './retry.service.ts';
import { TimeoutService } from './timeout.service.ts';
import { FallbackService } from './fallback.service.ts';
import { ResilientHttpClient } from './resilient-http.client.ts';

const ChargeSchema = z.object({ id: z.string() });

class FakeValkey {
  strings = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.strings.set(key, value);
  }
}

type FetchInit = { method?: string; headers?: Record<string, string>; body?: FetchJsonBody; signal?: AbortSignal };

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    text: async () => 'upstream failed',
  } as unknown as Response;
}

describe('ResilientHttpClient', () => {
  let valkey: FakeValkey;
  let circuitBreaker: CircuitBreakerService;
  let retry: RetryService;
  let timeout: TimeoutService;
  let fallback: FallbackService;
  let client: ResilientHttpClient;

  beforeEach(() => {
    valkey = new FakeValkey();
    circuitBreaker = new CircuitBreakerService(valkey as unknown as ValkeyService);
    retry = new RetryService();
    timeout = new TimeoutService();
    fallback = new FallbackService(valkey as unknown as ValkeyService);
    client = new ResilientHttpClient(circuitBreaker, retry, timeout, fallback);
  });

  describe('happy path', () => {
    it('returns the validated payload from a single circuit name', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse({ id: 'charge_1' }));

      await expect(
        client.request('https://paymob.test/charge', ChargeSchema, {
          circuitName: 'paymob',
          timeoutMs: 1000,
          fetchImpl,
        }),
      ).resolves.toEqual({ id: 'charge_1' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('records a circuit success', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse({ id: 'charge_1' }));
      await client.request('https://paymob.test/charge', ChargeSchema, {
        circuitName: 'paymob-success',
        timeoutMs: 1000,
        fetchImpl,
      });

      const stats = await circuitBreaker.getStats('paymob-success');
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
    });
  });

  describe('retry', () => {
    it('retries a 503 and succeeds on the second attempt', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(errorResponse(503))
        .mockResolvedValueOnce(okResponse({ id: 'charge_2' }));

      await expect(
        client.request('https://paymob.test/charge', ChargeSchema, {
          circuitName: 'paymob-retry',
          timeoutMs: 1000,
          fetchImpl,
          shouldRetry: () => true,
        }),
      ).resolves.toEqual({ id: 'charge_2' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('does not retry a 4xx by default', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(404));

      await expect(
        client.request('https://paymob.test/charge', ChargeSchema, {
          circuitName: 'paymob-404',
          timeoutMs: 1000,
          fetchImpl,
        }),
      ).rejects.toBeInstanceOf(FetchResponseError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry a schema validation failure', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse({ id: 42 }));

      await expect(
        client.request('https://paymob.test/charge', ChargeSchema, {
          circuitName: 'paymob-invalid',
          timeoutMs: 1000,
          fetchImpl,
        }),
      ).rejects.toBeInstanceOf(FetchValidationError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout', () => {
    it('aborts a hanging upstream and surfaces a timeout error', async () => {
      const fetchImpl = vi.fn().mockImplementation(
        (_url: string, init: FetchInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );

      await expect(
        client.request('https://sanity.test/query', ChargeSchema, {
          circuitName: 'sanity',
          timeoutMs: 20,
          fetchImpl,
          shouldRetry: () => false,
        }),
      ).rejects.toThrow(/timed out after 20ms/);
    });

    it('retries a timeout when the caller asks for it, with a short backoff', async () => {
      const fetchImpl = vi.fn().mockImplementation(
        (_url: string, init: FetchInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      );

      await expect(
        client.request('https://sanity.test/query', ChargeSchema, {
          circuitName: 'sanity-retry-timeout',
          timeoutMs: 10,
          fetchImpl,
          retryConfig: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 2, backoffMultiplier: 1, jitterMs: 0 },
        }),
      ).rejects.toThrow(/timed out after 10ms/);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe('circuit breaker', () => {
    it('short-circuits once the failure threshold is reached', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));

      for (let index = 0; index < 5; index += 1) {
        await expect(
          client.request('https://s3.test/put', ChargeSchema, {
            circuitName: 's3-open',
            timeoutMs: 1000,
            fetchImpl,
            shouldRetry: () => false,
          }),
        ).rejects.toBeInstanceOf(FetchResponseError);
      }

      await expect(circuitBreaker.getState('s3-open')).resolves.toBe('OPEN');

      const callsAfterOpening = fetchImpl.mock.calls.length;
      await expect(
        client.request('https://s3.test/put', ChargeSchema, {
          circuitName: 's3-open',
          timeoutMs: 1000,
          fetchImpl,
          shouldRetry: () => false,
        }),
      ).rejects.toThrow('is OPEN');
      expect(fetchImpl.mock.calls.length).toBe(callsAfterOpening);
    });

    it('is resettable', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));
      for (let index = 0; index < 5; index += 1) {
        await expect(
          client.request('https://s3.test/put', ChargeSchema, {
            circuitName: 's3-reset',
            timeoutMs: 1000,
            fetchImpl,
            shouldRetry: () => false,
          }),
        ).rejects.toBeInstanceOf(FetchResponseError);
      }

      await circuitBreaker.reset('s3-reset');
      await expect(circuitBreaker.getState('s3-reset')).resolves.toBe('CLOSED');
    });
  });

  describe('fallback', () => {
    it('serves the configured fallback when the upstream keeps failing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));

      await expect(
        client.request('https://sanity.test/query', ChargeSchema, {
          circuitName: 'sanity-fallback',
          timeoutMs: 1000,
          fetchImpl,
          shouldRetry: () => false,
          fallback: () => ({ id: 'cached' }),
        }),
      ).resolves.toEqual({ id: 'cached' });
    });

    it('serves a stale Valkey entry when the upstream fails', async () => {
      await valkey.set('sanity:post:1', JSON.stringify({ id: 'stale' }));
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));

      await expect(
        client.request('https://sanity.test/query', ChargeSchema, {
          circuitName: 'sanity-stale',
          timeoutMs: 1000,
          fetchImpl,
          shouldRetry: () => false,
          fallbackKey: 'sanity:post:1',
        }),
      ).resolves.toEqual({ id: 'stale' });
    });

    it('prefers the stale cache entry over the configured fallback', async () => {
      await valkey.set('sanity:post:2', JSON.stringify({ id: 'stale' }));
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));

      await expect(
        client.request('https://sanity.test/query', ChargeSchema, {
          circuitName: 'sanity-stale-first',
          timeoutMs: 1000,
          fetchImpl,
          shouldRetry: () => false,
          fallbackKey: 'sanity:post:2',
          fallback: () => ({ id: 'inline' }),
        }),
      ).resolves.toEqual({ id: 'stale' });
    });

    it('rethrows when there is no fallback at all', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));

      await expect(
        client.request('https://s3.test/put', ChargeSchema, {
          circuitName: 's3-no-fallback',
          timeoutMs: 1000,
          fetchImpl,
          shouldRetry: () => false,
        }),
      ).rejects.toBeInstanceOf(FetchResponseError);
    });
  });

  describe('composition', () => {
    it('applies timeout inside retry inside the circuit breaker', async () => {
      const order: string[] = [];
      const spyRetry = { execute: vi.fn() };
      const spyTimeout = { executeWithTimeout: vi.fn() };
      const spyCircuit = { execute: vi.fn() };

      const traced = new ResilientHttpClient(
        spyCircuit as unknown as CircuitBreakerService,
        spyRetry as unknown as RetryService,
        spyTimeout as unknown as TimeoutService,
        fallback,
      );

      spyTimeout.executeWithTimeout.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
        order.push('timeout');
        return fn();
      });
      spyRetry.execute.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
        order.push('retry');
        return fn();
      });
      spyCircuit.execute.mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
        order.push('circuit');
        return fn();
      });

      const result = await traced.request('https://api.test', ChargeSchema, {
        circuitName: 'traced',
        timeoutMs: 500,
        fetchImpl: vi.fn().mockResolvedValue(okResponse({ id: 'ok' })),
      });

      expect(result).toEqual({ id: 'ok' });
      expect(order).toEqual(['retry', 'circuit', 'timeout']);
    });
  });
});
