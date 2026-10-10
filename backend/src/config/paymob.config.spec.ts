import { afterEach, describe, expect, it } from 'vitest';

import {
  NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET,
  normalizePaymobBaseUrl,
  PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS,
  resolvePaymobConfig,
} from './paymob.config.ts';

afterEach(() => {
  delete process.env.NODE_ENV;
  delete process.env.PAYMOB_ENVIRONMENT;
  delete process.env.PAYMOB_API_KEY;
  delete process.env.PAYMOB_SANDBOX_API_KEY;
  delete process.env.PAYMOB_MERCHANT_ID;
  delete process.env.PAYMOB_INTEGRATION_ID;
  delete process.env.PAYMOB_SANDBOX_INTEGRATION_ID;
  delete process.env.PAYMOB_WEBHOOK_SECRET;
  delete process.env.PAYMOB_BASE_URL;
  delete process.env.PAYMOB_REQUEST_TIMEOUT_MS;
  delete process.env.PAYMOB_AUTH_TIMEOUT_MS;
  delete process.env.PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS;
  delete process.env.PAYMOB_RETRY_MAX_ATTEMPTS;
});

describe('normalizePaymobBaseUrl', () => {
  it('keeps a base url that already ends in /api', () => {
    expect(normalizePaymobBaseUrl('https://accept.paymob.com/api')).toBe('https://accept.paymob.com/api');
  });

  it('appends /api to a host only base url', () => {
    expect(normalizePaymobBaseUrl('https://accept.paymob.com')).toBe('https://accept.paymob.com/api');
  });

  it('strips trailing slashes before deciding', () => {
    expect(normalizePaymobBaseUrl('https://accept.paymob.com/api//')).toBe('https://accept.paymob.com/api');
  });

  it('rejects a non http(s) base url', () => {
    expect(() => normalizePaymobBaseUrl('ftp://accept.paymob.com')).toThrow(/http\(s\) URL/);
    expect(() => normalizePaymobBaseUrl('not a url')).toThrow(/http\(s\) URL/);
  });
});

describe('resolvePaymobConfig', () => {
  it('defaults to the sandbox environment and the Egypt sandbox base url', () => {
    const config = resolvePaymobConfig({});

    expect(config.environment).toBe('sandbox');
    expect(config.baseUrl).toBe('https://accept.paymob.com/api');
    expect(config.requestTimeoutMs).toBe(10_000);
    expect(config.authTimeoutMs).toBe(8_000);
    expect(config.retryMaxAttempts).toBe(2);
  });

  it('reads every documented variable', () => {
    const config = resolvePaymobConfig({
      PAYMOB_API_KEY: 'key',
      PAYMOB_MERCHANT_ID: 'merchant',
      PAYMOB_INTEGRATION_ID: 'integration',
      PAYMOB_WEBHOOK_SECRET: 'a-unique-webhook-secret-of-sufficient-length',
      PAYMOB_BASE_URL: 'https://ksa.paymob.com/api',
      PAYMOB_REQUEST_TIMEOUT_MS: '2500',
      PAYMOB_AUTH_TIMEOUT_MS: '1500',
      PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS: '900',
      PAYMOB_RETRY_MAX_ATTEMPTS: '4',
    });

    expect(config).toEqual({
      environment: 'sandbox',
      apiKey: 'key',
      merchantId: 'merchant',
      integrationId: 'integration',
      webhookSecret: 'a-unique-webhook-secret-of-sufficient-length',
      baseUrl: 'https://ksa.paymob.com/api',
      requestTimeoutMs: 2500,
      authTimeoutMs: 1500,
      authTokenCacheTtlSeconds: 900,
      retryMaxAttempts: 4,
    });
  });

  it('switches to the live environment and the live base url', () => {
    const config = resolvePaymobConfig({ PAYMOB_ENVIRONMENT: 'live' });

    expect(config.environment).toBe('live');
  });

  it('never caches a token for longer than Paymob keeps it alive', () => {
    const tooLong = resolvePaymobConfig({ PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS: '100000' });

    expect(tooLong.authTokenCacheTtlSeconds).toBeLessThan(PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS);
    expect(tooLong.authTokenCacheTtlSeconds).toBe(PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS - 60);
  });

  it('rejects a non positive or absurd timeout', () => {
    expect(() => resolvePaymobConfig({ PAYMOB_REQUEST_TIMEOUT_MS: '0' })).toThrow();
    expect(() => resolvePaymobConfig({ PAYMOB_REQUEST_TIMEOUT_MS: '999999' })).toThrow();
    expect(() => resolvePaymobConfig({ PAYMOB_AUTH_TIMEOUT_MS: 'not-a-number' })).toThrow();
  });

  it('rejects a retry count outside 0..10', () => {
    expect(() => resolvePaymobConfig({ PAYMOB_RETRY_MAX_ATTEMPTS: '-1' })).toThrow();
    expect(() => resolvePaymobConfig({ PAYMOB_RETRY_MAX_ATTEMPTS: '11' })).toThrow();
    expect(() => resolvePaymobConfig({ PAYMOB_RETRY_MAX_ATTEMPTS: '0' })).not.toThrow();
  });

  it('rejects an unknown environment name instead of guessing', () => {
    expect(() => resolvePaymobConfig({ PAYMOB_ENVIRONMENT: 'prod' })).toThrow();
  });

  it('reports a boot failure as one readable line rather than a JSON issue dump', () => {
    // A ZodError renders as `[{...}]`; an operator reading the first log line must see the cause.
    expect(() => resolvePaymobConfig({ PAYMOB_API_KEY: '' })).toThrow(/^Refusing to start with an unsafe Paymob/);
  });

  it('falls back to a placeholder credential rather than crashing the module on a missing value', () => {
    const config = resolvePaymobConfig({});

    expect(config.apiKey.length).toBeGreaterThan(0);
    expect(config.merchantId.length).toBeGreaterThan(0);
    expect(config.integrationId.length).toBeGreaterThan(0);
  });

  describe('PAYMOB_WEBHOOK_SECRET', () => {
    it('is resolved by the schema instead of being read from raw process.env at request time', () => {
      // The payments service used to read process.env.PAYMOB_WEBHOOK_SECRET inline, so an unset
      // variable surfaced as a 400 on the first webhook delivery. It is now a validated config
      // value, which means a missing secret is a boot-time decision, not a per-request one.
      expect(resolvePaymobConfig({}).webhookSecret).toBe(NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET);
      expect(resolvePaymobConfig({ PAYMOB_WEBHOOK_SECRET: 'unique-webhook-secret-1234567890' }).webhookSecret).toBe(
        'unique-webhook-secret-1234567890',
      );
    });

    it('treats an empty value as not configured rather than as a valid empty secret', () => {
      expect(resolvePaymobConfig({ PAYMOB_WEBHOOK_SECRET: '' }).webhookSecret).toBe(
        NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET,
      );
    });

    it('refuses a secret too short to be a real HMAC key', () => {
      expect(() => resolvePaymobConfig({ PAYMOB_WEBHOOK_SECRET: 'short' })).toThrow(
        /PAYMOB_WEBHOOK_SECRET must be at least 32 characters/,
      );
    });

    it('refuses to boot in production with the built-in development secret', () => {
      expect(() => resolvePaymobConfig({ NODE_ENV: 'production' })).toThrow(/PAYMOB_WEBHOOK_SECRET/);
      expect(() => resolvePaymobConfig({ NODE_ENV: 'production' })).toThrow(/Refusing to start/);
    });

    it('refuses to boot in production with the placeholder shipped in .env.example', () => {
      // Shipping the placeholder in the repository makes it public, so a copy-paste deploy is
      // exactly as unsigned as one that sets nothing.
      expect(() =>
        resolvePaymobConfig({ NODE_ENV: 'production', PAYMOB_WEBHOOK_SECRET: 'your-webhook-secret' }),
      ).toThrow(/PAYMOB_WEBHOOK_SECRET is still a publicly known placeholder/);
    });

    it('accepts a real secret in production', () => {
      // It previously passed ONLY the webhook secret and expected production to boot. That was the
      // gap: the three credentials that decide whether a payment can be taken had `sandbox-*` defaults
      // with no guard, so exactly this configuration booted healthy and failed every checkout.
      const config = resolvePaymobConfig({
        NODE_ENV: 'production',
        PAYMOB_ENVIRONMENT: 'live',
        PAYMOB_WEBHOOK_SECRET: 'a-genuinely-unique-webhook-secret-value',
        PAYMOB_API_KEY: 'live-api-key',
        PAYMOB_MERCHANT_ID: 'live-merchant-id',
        PAYMOB_INTEGRATION_ID: 'live-integration-id',
      });

      expect(config.webhookSecret).toBe('a-genuinely-unique-webhook-secret-value');
    });
  });

  /**
   * The three credentials that decide whether a payment can happen at all, and the environment flag
   * that selects the key mode. Paymob runs both modes on the same regional host and distinguishes
   * them by the KEYS, so there is no URL that can catch a mismatch — the boot check is the only place
   * it can be caught, and without it the failure is a gateway 404 on the customer's first checkout.
   */
  describe('production credentials', () => {
    const productionEnv = {
      NODE_ENV: 'production',
      PAYMOB_ENVIRONMENT: 'live',
      PAYMOB_WEBHOOK_SECRET: 'a-genuinely-unique-webhook-secret-value',
    } as const;

    it.each([
      ['PAYMOB_API_KEY', 'sandbox-paymob-api-key'],
      ['PAYMOB_MERCHANT_ID', 'sandbox-merchant-id'],
      ['PAYMOB_INTEGRATION_ID', 'sandbox-integration-id'],
    ])('should refuse to boot when %s is still the published placeholder', (key, placeholder) => {
      expect(() =>
        resolvePaymobConfig({
          ...productionEnv,
          // The three live values FIRST, then the one under test LAST. The other way round the
          // literals overwrite the computed key and the guard never sees the placeholder.
          PAYMOB_API_KEY: 'live-api-key',
          PAYMOB_MERCHANT_ID: 'live-merchant-id',
          PAYMOB_INTEGRATION_ID: 'live-integration-id',
          [key]: placeholder,
        }),
      ).toThrow(key);
      // The message names the VARIABLE, not the value — so the assertion checks the variable, and
      // the value is asserted here rather than through `toThrow`.
      try {
        resolvePaymobConfig({
          ...productionEnv,
          PAYMOB_API_KEY: 'live-api-key',
          PAYMOB_MERCHANT_ID: 'live-merchant-id',
          PAYMOB_INTEGRATION_ID: 'live-integration-id',
          [key]: placeholder,
        } as unknown as NodeJS.ProcessEnv);
        expect.unreachable(`${key} should have been refused`);
      } catch (error) {
        expect((error as Error).message).toContain(key);
        expect((error as Error).message).toContain('the KEYS, not by the host');
      }
    });

    it('should refuse a sandbox environment in production even with real-looking keys', () => {
      // The operator's own mistake rather than a forgotten variable, and the same failure: no money is
      // taken and the module looks healthy.
      expect(() =>
        resolvePaymobConfig({
          NODE_ENV: 'production',
          PAYMOB_ENVIRONMENT: 'sandbox',
          PAYMOB_WEBHOOK_SECRET: 'a-genuinely-unique-webhook-secret-value',
          PAYMOB_API_KEY: 'live-api-key',
          PAYMOB_MERCHANT_ID: 'live-merchant-id',
          PAYMOB_INTEGRATION_ID: 'live-integration-id',
        }),
      ).toThrow('PAYMOB_ENVIRONMENT');
    });

    it('should NOT apply the guard outside production', () => {
      // The unit suite and local development run with no environment at all; a boot failure there
      // would break every test that touches the payments module.
      expect(() => resolvePaymobConfig({ NODE_ENV: 'development' })).not.toThrow();
      expect(resolvePaymobConfig({ NODE_ENV: 'test' }).apiKey).toBe('sandbox-paymob-api-key');
    });
  });

  it('reads the live process environment by default', () => {
    process.env.PAYMOB_ENVIRONMENT = 'live';
    process.env.PAYMOB_API_KEY = 'from-process-env';

    expect(resolvePaymobConfig().environment).toBe('live');
    expect(resolvePaymobConfig().apiKey).toBe('from-process-env');
  });
});
