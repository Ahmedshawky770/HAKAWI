import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS,
  resolvePaymobConfig,
  type PaymobConfig,
} from '../../../config/paymob.config.ts';
import { CircuitBreakerService } from '../../../common/resilience/circuit-breaker.service.ts';
import { RetryService } from '../../../common/resilience/retry.service.ts';
import { TimeoutService } from '../../../common/resilience/timeout.service.ts';
import { FallbackService } from '../../../common/resilience/fallback.service.ts';
import { ResilientHttpClient } from '../../../common/resilience/resilient-http.client.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { FetchResponseError, FetchValidationError, type FetchJsonBody } from '../../../common/utils/fetch.util.ts';

import { PaymobClient, PaymobGatewayError, PAYMOB_CIRCUIT_NAME } from './paymob.client.ts';

type FetchCall = { readonly url: string; readonly body: Record<string, unknown> | null };
type Responder = (call: FetchCall) => Response | Promise<Response>;
type FetchMock = ReturnType<typeof vi.fn<(input: unknown, init?: unknown) => Promise<Response>>>;

class FakeValkey {
  readonly strings = new Map<string, string>();
  readonly ttls = new Map<string, number | undefined>();
  readonly deleted: string[] = [];

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.strings.set(key, value);
    this.ttls.set(key, ttl);
  }

  async del(key: string): Promise<void> {
    this.deleted.push(key);
    this.strings.delete(key);
  }
}

const AUTH_TOKEN_KEY = 'paymob:auth-token:sandbox:merchant-42';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number, statusText: string, body = '{"detail":"upstream"}'): Response {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response;
}

function htmlResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '<html>gateway down</html>',
  } as unknown as Response;
}

function parseBody(init: unknown): Record<string, unknown> | null {
  const initRecord = init as { body?: FetchJsonBody } | undefined;
  if (typeof initRecord?.body !== 'string') {
    return null;
  }
  return JSON.parse(initRecord.body) as Record<string, unknown>;
}

function createFetch(responder: Responder): { fetchImpl: FetchMock; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: unknown) => {
    const call: FetchCall = { url: String(input), body: parseBody(init) };
    calls.push(call);
    return responder(call);
  });
  return { fetchImpl, calls };
}

function happyPaymob(
  overrides: { authToken?: string; orderId?: number | string; paymentKey?: string } = {},
): Responder {
  return (call) => {
    if (call.url.endsWith('/auth/tokens')) {
      return jsonResponse({ token: overrides.authToken ?? 'auth-token-1' });
    }
    if (call.url.endsWith('/ecommerce/orders')) {
      return jsonResponse({ id: overrides.orderId ?? 987654 });
    }
    return jsonResponse({ token: overrides.paymentKey ?? 'payment-key-abc' });
  };
}

const BASE_CONFIG: PaymobConfig = {
  environment: 'sandbox',
  apiKey: 'api-key-sandbox',
  merchantId: 'merchant-42',
  integrationId: 'integration-77',
  webhookSecret: 'webhook-secret-for-the-client-spec',
  baseUrl: 'https://accept.paymob.com/api',
  requestTimeoutMs: 5000,
  authTimeoutMs: 4000,
  authTokenCacheTtlSeconds: 3000,
  retryMaxAttempts: 0,
};

type Harness = {
  readonly client: PaymobClient;
  readonly valkey: FakeValkey;
  readonly circuitBreaker: CircuitBreakerService;
  readonly calls: FetchCall[];
  readonly fetchImpl: FetchMock;
};

function buildHarness(responder: Responder = happyPaymob(), config: Partial<PaymobConfig> = {}): Harness {
  const valkey = new FakeValkey();
  const circuitBreaker = new CircuitBreakerService(valkey as unknown as ValkeyService);
  const http = new ResilientHttpClient(
    circuitBreaker,
    new RetryService(),
    new TimeoutService(),
    new FallbackService(valkey as unknown as ValkeyService),
  );
  const { fetchImpl, calls } = createFetch(responder);
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
  };
  const client = new PaymobClient(
    { ...BASE_CONFIG, ...config },
    http,
    valkey as unknown as ValkeyService,
    logger as unknown as WinstonLoggerService,
    { fetchImpl: fetchImpl as unknown as typeof fetch },
  );
  return { client, valkey, circuitBreaker, calls, fetchImpl };
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  return run().then(
    () => {
      throw new Error('expected the call to reject');
    },
    (error: unknown) => error,
  );
}

const CHECKOUT = { amountCents: 2500, currency: 'EGP', merchantOrderId: 'payment-1' } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaymobClient', () => {
  describe('step 1: auth token', () => {
    it('POSTs the api key to /api/auth/tokens', async () => {
      const { client, calls } = buildHarness();

      await client.createCheckout(CHECKOUT);

      expect(calls[0]?.url).toBe('https://accept.paymob.com/api/auth/tokens');
      expect(calls[0]?.body).toEqual({ api_key: 'api-key-sandbox' });
    });

    it('caches the token in Valkey with a TTL shorter than the Paymob token lifetime', async () => {
      const { client, valkey } = buildHarness();

      await client.createCheckout(CHECKOUT);

      expect(valkey.strings.get(AUTH_TOKEN_KEY)).toBe('auth-token-1');
      expect(valkey.ttls.get(AUTH_TOKEN_KEY)).toBe(BASE_CONFIG.authTokenCacheTtlSeconds);
      expect(BASE_CONFIG.authTokenCacheTtlSeconds).toBeLessThan(PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS);
    });

    it('serves the next checkout from the cache without a second auth request', async () => {
      const { client, calls } = buildHarness();

      await client.createCheckout(CHECKOUT);
      await client.createCheckout({ ...CHECKOUT, merchantOrderId: 'payment-2' });

      expect(calls.filter((call) => call.url.endsWith('/auth/tokens'))).toHaveLength(1);
      expect(calls.filter((call) => call.url.endsWith('/ecommerce/orders'))).toHaveLength(2);
    });

    it('collapses concurrent cache misses into a single auth request', async () => {
      let authRequests = 0;
      const { client } = buildHarness((call) => {
        if (call.url.endsWith('/auth/tokens')) {
          authRequests += 1;
          return jsonResponse({ token: 'shared-token' });
        }
        if (call.url.endsWith('/ecommerce/orders')) {
          return jsonResponse({ id: 5 });
        }
        return jsonResponse({ token: 'pk' });
      });

      const results = await Promise.all([
        client.createCheckout(CHECKOUT),
        client.createCheckout({ ...CHECKOUT, merchantOrderId: 'payment-2' }),
      ]);

      expect(authRequests).toBe(1);
      expect(results.map((result) => result.paymentKey)).toEqual(['pk', 'pk']);
    });

    it('does not cache a failed auth attempt', async () => {
      let attempts = 0;
      const { client, valkey } = buildHarness((call) => {
        if (call.url.endsWith('/auth/tokens')) {
          attempts += 1;
          return attempts === 1 ? errorResponse(401, 'Unauthorized') : jsonResponse({ token: 't' });
        }
        if (call.url.endsWith('/ecommerce/orders')) {
          return jsonResponse({ id: 3 });
        }
        return jsonResponse({ token: 'pk' });
      });

      await expect(client.createCheckout(CHECKOUT)).rejects.toThrow(PaymobGatewayError);
      expect(valkey.strings.get(AUTH_TOKEN_KEY)).toBeUndefined();

      await expect(client.createCheckout(CHECKOUT)).resolves.toMatchObject({ orderId: '3' });
    });

    it('rejects a 200 response with an empty token through Zod', async () => {
      const { client } = buildHarness(() => jsonResponse({ token: '' }));

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect(error).toBeInstanceOf(PaymobGatewayError);
      expect((error as PaymobGatewayError).cause).toBeInstanceOf(FetchValidationError);
    });

    it('rejects a body that is not JSON at all', async () => {
      const { client } = buildHarness(() => htmlResponse());

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect((error as PaymobGatewayError).message).toMatch(/not valid JSON/);
    });

    it('wraps a 401 as a gateway error naming the step and preserving the cause', async () => {
      const { client } = buildHarness(() => errorResponse(401, 'Unauthorized'));

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect(error).toBeInstanceOf(PaymobGatewayError);
      expect((error as PaymobGatewayError).step).toBe('auth token');
      expect((error as PaymobGatewayError).message).toContain('HTTP 401');
      expect((error as PaymobGatewayError).cause).toBeInstanceOf(FetchResponseError);
    });
  });

  describe('step 2: order registration', () => {
    it('POSTs the auth token, merchant id, amount and currency to /api/ecommerce/orders', async () => {
      const { client, calls } = buildHarness();

      await client.createCheckout({ ...CHECKOUT, amountCents: 25_000 });

      const orderCall = calls.find((call) => call.url.endsWith('/ecommerce/orders'));
      expect(orderCall?.url).toBe('https://accept.paymob.com/api/ecommerce/orders');
      expect(orderCall?.body).toEqual({
        auth_token: 'auth-token-1',
        merchant_id: 'merchant-42',
        amount_cents: 25_000,
        currency: 'EGP',
        merchant_order_id: 'payment-1',
      });
    });

    it('returns the Paymob order id, not a locally invented one', async () => {
      const { client } = buildHarness(happyPaymob({ orderId: 4242 }));

      await expect(client.createCheckout(CHECKOUT)).resolves.toMatchObject({ orderId: '4242' });
    });

    it('accepts a numeric string order id', async () => {
      const { client } = buildHarness(happyPaymob({ orderId: '5150' }));

      await expect(client.createCheckout(CHECKOUT)).resolves.toMatchObject({ orderId: '5150' });
    });

    it('rejects an order response with a non numeric id', async () => {
      const { client } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens') ? jsonResponse({ token: 't' }) : jsonResponse({ id: 'not-a-number' }),
      );

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect((error as PaymobGatewayError).step).toBe('order registration');
      expect((error as PaymobGatewayError).cause).toBeInstanceOf(FetchValidationError);
    });

    it('rejects an order response with no id at all', async () => {
      const { client } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens') ? jsonResponse({ token: 't' }) : jsonResponse({ unexpected: true }),
      );

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect((error as PaymobGatewayError).message).toMatch(/id/i);
    });

    it('rejects a negative order id', async () => {
      const { client } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens') ? jsonResponse({ token: 't' }) : jsonResponse({ id: -1 }),
      );

      await expect(client.createCheckout(CHECKOUT)).rejects.toThrow(PaymobGatewayError);
    });
  });

  describe('step 3: payment key', () => {
    it('POSTs the registered order id to /api/acceptance/payment_keys', async () => {
      const { client, calls } = buildHarness(happyPaymob({ orderId: 4242 }));

      await client.createCheckout({ ...CHECKOUT, amountCents: 25_000 });

      const keyCall = calls.find((call) => call.url.endsWith('/acceptance/payment_keys'));
      expect(keyCall?.url).toBe('https://accept.paymob.com/api/acceptance/payment_keys');
      expect(keyCall?.body).toEqual({
        auth_token: 'auth-token-1',
        amount_cents: 25_000,
        currency: 'EGP',
        order_id: 4242,
        merchant_id: 'merchant-42',
        integration_id: 'integration-77',
        lock_order_when_paid: true,
        billing_email: 'no-reply@hakawi.com',
      });
    });

    it('rejects a payment key response with a null token', async () => {
      const { client } = buildHarness((call) => {
        if (call.url.endsWith('/auth/tokens')) {
          return jsonResponse({ token: 't' });
        }
        if (call.url.endsWith('/ecommerce/orders')) {
          return jsonResponse({ id: 1 });
        }
        return jsonResponse({ token: null });
      });

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect((error as PaymobGatewayError).step).toBe('payment key request');
      expect((error as PaymobGatewayError).cause).toBeInstanceOf(FetchValidationError);
    });
  });

  describe('step 4: iframe and accept urls', () => {
    it('derives both urls from the payment key and the merchant id', async () => {
      const { client } = buildHarness(happyPaymob({ paymentKey: 'pk/with+chars' }));

      const checkout = await client.createCheckout(CHECKOUT);

      expect(checkout.iframeUrl).toBe(
        'https://accept.paymob.com/acceptance/iframes/pk%2Fwith%2Bchars?merchant_id=merchant-42',
      );
      expect(checkout.acceptUrl).toBe(
        'https://accept.paymob.com/acceptance/accepts/pk%2Fwith%2Bchars?merchant_id=merchant-42',
      );
    });

    it('never points at the non Paymob host the old stub fabricated', async () => {
      const { client } = buildHarness();

      const checkout = await client.createCheckout(CHECKOUT);

      expect(checkout.iframeUrl).not.toContain('secure.accepting.com');
      expect(checkout.orderId).toBe('987654');
    });
  });

  describe('sandbox and live environments', () => {
    it('defaults to sandbox', () => {
      const config = resolvePaymobConfig({});

      expect(config.environment).toBe('sandbox');
      expect(config.baseUrl).toBe('https://accept.paymob.com/api');
    });

    it('switches to live when the environment says so', () => {
      const config = resolvePaymobConfig({ PAYMOB_ENVIRONMENT: 'live', PAYMOB_API_KEY: 'live-key' });

      expect(config.environment).toBe('live');
      expect(config.apiKey).toBe('live-key');
    });

    it('prefers sandbox-only credentials in the sandbox environment', () => {
      const config = resolvePaymobConfig({
        PAYMOB_API_KEY: 'live-key',
        PAYMOB_SANDBOX_API_KEY: 'sandbox-key',
        PAYMOB_INTEGRATION_ID: 'live-integration',
        PAYMOB_SANDBOX_INTEGRATION_ID: 'sandbox-integration',
      });

      expect(config.apiKey).toBe('sandbox-key');
      expect(config.integrationId).toBe('sandbox-integration');
    });

    it('never uses sandbox credentials in the live environment', () => {
      const config = resolvePaymobConfig({
        PAYMOB_ENVIRONMENT: 'live',
        PAYMOB_API_KEY: 'live-key',
        PAYMOB_SANDBOX_API_KEY: 'sandbox-key',
        PAYMOB_INTEGRATION_ID: 'live-integration',
        PAYMOB_SANDBOX_INTEGRATION_ID: 'sandbox-integration',
      });

      expect(config.apiKey).toBe('live-key');
      expect(config.integrationId).toBe('live-integration');
    });

    it('appends /api to a host-only base url and tolerates trailing slashes', () => {
      expect(resolvePaymobConfig({ PAYMOB_BASE_URL: 'https://accept.paymob.com' }).baseUrl).toBe(
        'https://accept.paymob.com/api',
      );
      expect(resolvePaymobConfig({ PAYMOB_BASE_URL: 'https://accept.paymob.com/api///' }).baseUrl).toBe(
        'https://accept.paymob.com/api',
      );
    });

    it('rejects a base url that is not http(s)', () => {
      expect(() => resolvePaymobConfig({ PAYMOB_BASE_URL: 'ftp://accept.paymob.com' })).toThrow();
    });

    it('rejects an unknown environment name', () => {
      expect(() => resolvePaymobConfig({ PAYMOB_ENVIRONMENT: 'staging' })).toThrow();
    });

    it('routes every call at the configured base url, in the documented order', async () => {
      const { client, calls } = buildHarness();

      await client.createCheckout(CHECKOUT);

      expect(calls.map((call) => call.url)).toEqual([
        'https://accept.paymob.com/api/auth/tokens',
        'https://accept.paymob.com/api/ecommerce/orders',
        'https://accept.paymob.com/api/acceptance/payment_keys',
      ]);
    });

    it('routes every call at a custom regional base url', async () => {
      const { client, calls } = buildHarness(undefined, { baseUrl: 'https://ksa.paymob.com/api' });

      await client.createCheckout(CHECKOUT);

      expect(calls.map((call) => call.url)).toEqual([
        'https://ksa.paymob.com/api/auth/tokens',
        'https://ksa.paymob.com/api/ecommerce/orders',
        'https://ksa.paymob.com/api/acceptance/payment_keys',
      ]);
    });
  });

  describe('input validation before any network call', () => {
    it('refuses a zero, negative or fractional amount', async () => {
      const { client, fetchImpl } = buildHarness();

      await expect(client.createCheckout({ ...CHECKOUT, amountCents: 0 })).rejects.toBeInstanceOf(ZodError);
      await expect(client.createCheckout({ ...CHECKOUT, amountCents: -1 })).rejects.toBeInstanceOf(ZodError);
      await expect(client.createCheckout({ ...CHECKOUT, amountCents: 10.5 })).rejects.toBeInstanceOf(ZodError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses a malformed currency', async () => {
      const { client, fetchImpl } = buildHarness();

      await expect(client.createCheckout({ ...CHECKOUT, currency: 'EG' })).rejects.toBeInstanceOf(ZodError);
      await expect(client.createCheckout({ ...CHECKOUT, currency: 'EGPP' })).rejects.toBeInstanceOf(ZodError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses a transaction id that is not a Paymob transaction id', async () => {
      const { client, fetchImpl } = buildHarness();

      await expect(client.refundTransaction({ transactionId: 'abc-123', amountCents: 500 })).rejects.toBeInstanceOf(
        ZodError,
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('error paths', () => {
    it('stops at a 500 from the order endpoint and never asks for a payment key', async () => {
      const { client, calls } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens') ? jsonResponse({ token: 't' }) : errorResponse(500, 'Internal Server Error'),
      );

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect((error as PaymobGatewayError).step).toBe('order registration');
      expect((error as PaymobGatewayError).message).toContain('HTTP 500');
      expect(calls.some((call) => call.url.endsWith('/payment_keys'))).toBe(false);
    });

    it('surfaces a timeout instead of returning a URL', async () => {
      const { client } = buildHarness(() => new Promise<Response>(() => undefined), {
        requestTimeoutMs: 30,
        authTimeoutMs: 30,
      });

      const error = await captureError(() => client.createCheckout(CHECKOUT));

      expect(error).toBeInstanceOf(PaymobGatewayError);
      expect((error as PaymobGatewayError).message).toMatch(/timed out after 30ms/);
    });

    it('retries a 503 up to the configured attempt count', async () => {
      let orderAttempts = 0;
      const { client } = buildHarness(
        (call) => {
          if (call.url.endsWith('/auth/tokens')) {
            return jsonResponse({ token: 't' });
          }
          if (call.url.endsWith('/ecommerce/orders')) {
            orderAttempts += 1;
            return orderAttempts === 1 ? errorResponse(503, 'Service Unavailable') : jsonResponse({ id: 12 });
          }
          return jsonResponse({ token: 'pk' });
        },
        { retryMaxAttempts: 2 },
      );

      await expect(client.createCheckout(CHECKOUT)).resolves.toMatchObject({ orderId: '12' });
      expect(orderAttempts).toBe(2);
    });

    it('does not retry a 4xx', async () => {
      let orderAttempts = 0;
      const { client } = buildHarness(
        (call) => {
          if (call.url.endsWith('/auth/tokens')) {
            return jsonResponse({ token: 't' });
          }
          orderAttempts += 1;
          return errorResponse(400, 'Bad Request');
        },
        { retryMaxAttempts: 3 },
      );

      await expect(client.createCheckout(CHECKOUT)).rejects.toThrow(/HTTP 400/);
      expect(orderAttempts).toBe(1);
    });

    it('shares one circuit name so a flapping gateway opens one breaker', async () => {
      const { client, circuitBreaker } = buildHarness();

      await client.createCheckout(CHECKOUT);

      const stats = await circuitBreaker.getStats(PAYMOB_CIRCUIT_NAME);
      expect(stats.totalCalls).toBe(3);
      expect(stats.totalSuccesses).toBe(3);
      expect(stats.totalFailures).toBe(0);
    });

    it('records circuit failures when the gateway is down', async () => {
      const { client, circuitBreaker } = buildHarness(() => errorResponse(500, 'Internal Server Error'));

      await expect(client.createCheckout(CHECKOUT)).rejects.toThrow(PaymobGatewayError);

      const stats = await circuitBreaker.getStats(PAYMOB_CIRCUIT_NAME);
      expect(stats.totalFailures).toBeGreaterThan(0);
    });
  });

  describe('refund submission', () => {
    it('POSTs the auth token, merchant id, transaction id and amount to the refund endpoint', async () => {
      const { client, calls } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens')
          ? jsonResponse({ token: 't' })
          : jsonResponse({
              id: 555,
              success: true,
              pending: false,
              is_refund: true,
              amount_cents: 1000,
              currency: 'EGP',
              order: { id: 987, merchant_order_id: 'payment-1' },
              source_data: { type: 'card' },
            }),
      );

      const result = await client.refundTransaction({ transactionId: '123456', amountCents: 1000 });

      const refundCall = calls.find((call) => call.url.endsWith('/acceptance/void_refund/refund'));
      expect(refundCall?.url).toBe('https://accept.paymob.com/api/acceptance/void_refund/refund');
      expect(refundCall?.body).toEqual({
        auth_token: 't',
        merchant_id: 'merchant-42',
        transaction_id: '123456',
        amount_cents: 1000,
      });
      expect(result).toMatchObject({
        refundId: '555',
        success: true,
        pending: false,
        isRefund: true,
        amountCents: 1000,
        currency: 'EGP',
      });
    });

    it('prefers an explicit refund_id when Paymob returns one', async () => {
      const { client } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens')
          ? jsonResponse({ token: 't' })
          : jsonResponse({ id: 7, refund_id: 'rf-2026-0001', success: true, pending: true }),
      );

      const result = await client.refundTransaction({ transactionId: 7, amountCents: 500 });

      expect(result.refundId).toBe('rf-2026-0001');
      expect(result.pending).toBe(true);
    });

    it('rejects a refund response with no id instead of inventing one', async () => {
      const { client } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens') ? jsonResponse({ token: 't' }) : jsonResponse({ success: true }),
      );

      const error = await captureError(() => client.refundTransaction({ transactionId: 7, amountCents: 500 }));

      expect(error).toBeInstanceOf(PaymobGatewayError);
      expect((error as PaymobGatewayError).cause).toBeInstanceOf(FetchValidationError);
    });

    it('treats a non-3xx refund response as a failure', async () => {
      const { client } = buildHarness((call) =>
        call.url.endsWith('/auth/tokens') ? jsonResponse({ token: 't' }) : errorResponse(422, 'Unprocessable Entity'),
      );

      const error = await captureError(() => client.refundTransaction({ transactionId: 7, amountCents: 500 }));

      expect((error as PaymobGatewayError).message).toContain('HTTP 422');
    });
  });

  describe('invalidateAuthToken', () => {
    it('drops the cached token so the next call re-authenticates', async () => {
      const { client, valkey, calls } = buildHarness();

      await client.createCheckout(CHECKOUT);
      await client.invalidateAuthToken();
      await client.createCheckout({ ...CHECKOUT, merchantOrderId: 'payment-2' });

      expect(valkey.deleted).toContain(AUTH_TOKEN_KEY);
      expect(calls.filter((call) => call.url.endsWith('/auth/tokens'))).toHaveLength(2);
    });
  });

  describe('outbound request shape', () => {
    it('serialises every outbound body as a JSON string', async () => {
      const { client, calls } = buildHarness();

      await client.createCheckout(CHECKOUT);

      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call.body).not.toBeNull();
      }
    });
  });
});
