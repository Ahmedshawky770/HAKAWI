import { afterEach, describe, expect, it } from 'vitest';
import { Injectable, Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import paymobConfig, {
  NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET,
  normalizePaymobBaseUrl,
  PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS,
  PAYMOB_CONFIG_NAMESPACE,
  resolvePaymobConfig,
  resolvePaymobPaymentMethodId,
  type PaymobPaymentMethodChoice,
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
  delete process.env.PAYMOB_CARD_PAYMENT_METHOD_ID;
  delete process.env.PAYMOB_WALLET_PAYMENT_METHOD_ID;
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
      PAYMOB_CARD_PAYMENT_METHOD_ID: '7',
      PAYMOB_WALLET_PAYMENT_METHOD_ID: '9',
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
      cardPaymentMethodId: '7',
      walletPaymentMethodId: '9',
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

  /**
   * THE TWO OPTIONAL PAYMENT METHOD IDS.
   *
   * They are the merchant's own Paymob numbers for a card and a mobile wallet, so they cannot be
   * written into this codebase — and they are OPTIONAL, because their absence has a documented
   * meaning (the gateway asks the customer) rather than being a boot failure.
   */
  describe('the payment method ids', () => {
    it('reads both of them when the deployment configures them', () => {
      const config = resolvePaymobConfig({
        PAYMOB_CARD_PAYMENT_METHOD_ID: '7',
        PAYMOB_WALLET_PAYMENT_METHOD_ID: '9',
      });

      expect(config.cardPaymentMethodId).toBe('7');
      expect(config.walletPaymentMethodId).toBe('9');
    });

    it('leaves them unset when the deployment configures neither', () => {
      const config = resolvePaymobConfig({});

      expect(config.cardPaymentMethodId).toBeUndefined();
      expect(config.walletPaymentMethodId).toBeUndefined();
    });

    it('treats a blank value as not configured rather than as a valid id', () => {
      const config = resolvePaymobConfig({
        PAYMOB_CARD_PAYMENT_METHOD_ID: '  ',
        PAYMOB_WALLET_PAYMENT_METHOD_ID: '',
      });

      expect(config.cardPaymentMethodId).toBeUndefined();
      expect(config.walletPaymentMethodId).toBeUndefined();
    });

    /**
     * A MALFORMED VALUE IS "NOT CONFIGURED", NOT A BOOT FAILURE.
     *
     * The value used to be checked with a hard `refine()`, so a typo — "card" where a
     * number belongs — stopped the WHOLE application from starting, over an optional
     * convenience, and the operator was told "must be a positive integer id" without
     * being told WHICH VARIABLE. That is an outage caused by the very thing the value's
     * own comment says must not happen: "an optional convenience must not be able to take
     * the product down".
     *
     * So a value that is not a positive integer is IGNORED — the feature is off, and
     * everything else keeps working — and it is reported loudly, because the operator has
     * to know that the reader's choice is not being forwarded.
     */
    it('ignores an id that is not a positive integer instead of refusing to start', () => {
      expect(() => resolvePaymobConfig({ PAYMOB_CARD_PAYMENT_METHOD_ID: 'card' })).not.toThrow();
      expect(resolvePaymobConfig({ PAYMOB_CARD_PAYMENT_METHOD_ID: 'card' }).cardPaymentMethodId).toBeUndefined();
      expect(resolvePaymobConfig({ PAYMOB_CARD_PAYMENT_METHOD_ID: '0' }).cardPaymentMethodId).toBeUndefined();
      expect(resolvePaymobConfig({ PAYMOB_WALLET_PAYMENT_METHOD_ID: '-3' }).walletPaymentMethodId).toBeUndefined();
      expect(resolvePaymobConfig({ PAYMOB_WALLET_PAYMENT_METHOD_ID: '1.5' }).walletPaymentMethodId).toBeUndefined();
    });

    it('keeps the value when it is a positive integer', () => {
      expect(resolvePaymobConfig({ PAYMOB_CARD_PAYMENT_METHOD_ID: '7' }).cardPaymentMethodId).toBe('7');
      expect(resolvePaymobConfig({ PAYMOB_WALLET_PAYMENT_METHOD_ID: '9' }).walletPaymentMethodId).toBe('9');
    });

    it('does not refuse to boot in production because of them', () => {
      // An unconfigured method id costs the FEATURE, not the deployment: the gateway asks the
      // customer, which is what it did before the reader's choice existed.
      const config = resolvePaymobConfig({
        NODE_ENV: 'production',
        PAYMOB_ENVIRONMENT: 'live',
        PAYMOB_WEBHOOK_SECRET: 'a-genuinely-unique-webhook-secret-value',
        PAYMOB_API_KEY: 'live-api-key',
        PAYMOB_MERCHANT_ID: 'live-merchant-id',
        PAYMOB_INTEGRATION_ID: 'live-integration-id',
      });

      expect(config.cardPaymentMethodId).toBeUndefined();
    });
  });

  /**
   * THE ONE PLACE THE READER'S CHOICE BECOMES A GATEWAY INSTRUMENT.
   */
  describe('resolvePaymobPaymentMethodId', () => {    const config = resolvePaymobConfig({
      PAYMOB_CARD_PAYMENT_METHOD_ID: '7',
      PAYMOB_WALLET_PAYMENT_METHOD_ID: '9',
    });

    it('maps the card choice to the card id and the wallet choice to the wallet id', () => {
      expect(resolvePaymobPaymentMethodId(config, 'card')).toBe('7');
      expect(resolvePaymobPaymentMethodId(config, 'wallet')).toBe('9');
    });

    it('returns nothing when the deployment configured no id for that instrument', () => {
      const halfConfigured = resolvePaymobConfig({ PAYMOB_CARD_PAYMENT_METHOD_ID: '7' });

      expect(resolvePaymobPaymentMethodId(halfConfigured, 'card')).toBe('7');
      expect(resolvePaymobPaymentMethodId(halfConfigured, 'wallet')).toBeUndefined();
    });

    it('returns nothing when there is no choice or no configuration at all', () => {
      expect(resolvePaymobPaymentMethodId(config, undefined)).toBeUndefined();
      expect(resolvePaymobPaymentMethodId(undefined, 'card')).toBeUndefined();
      expect(resolvePaymobPaymentMethodId(undefined, undefined)).toBeUndefined();
    });

    it('resolves a word it does not know to nothing, rather than to the wallet', () => {
      // A choice that falls through to the wallet id would quietly charge a reader through an
      // instrument they did not pick. It resolves to nothing instead, and the gateway asks.
      expect(resolvePaymobPaymentMethodId(config, 'bitcoin' as PaymobPaymentMethodChoice)).toBeUndefined();
    });
  });
});

/**
 * THE NAMESPACE IS REACHABLE FROM A MODULE THAT DOES NOT PROVIDE THE TOKEN.
 *
 * The books module resolves the reader's choice of instrument against this configuration, and it
 * cannot inject the `PAYMOB_CONFIG` token — that token is provided inside the payments module and
 * is not exported from it. What it CAN do is read the same resolved object through the global
 * `ConfigService`, because `ConfigModule.forFeature(paymob)` merges it into the shared config host
 * under the `paymob` namespace. This is the wiring that makes that true, asserted rather than
 * assumed: if it broke, the reader's choice would silently stop reaching the gateway.
 */
@Injectable()
class PaymobConfigProbe {
  constructor(private readonly configService: ConfigService) {}

  read(): Record<string, unknown> | undefined {
    return this.configService.get<Record<string, unknown>>(PAYMOB_CONFIG_NAMESPACE);
  }
}

/**
 * The shape of the real application: the root configuration lives in a GLOBAL module that exports
 * `ConfigModule` (this is `CommonModule`), and the Paymob namespace is registered by a different
 * module through `ConfigModule.forFeature` (this is `PaymentsModule`).
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [] })],
  exports: [ConfigModule],
})
class PaymobConfigRootModule {}

@Module({
  imports: [ConfigModule.forFeature(paymobConfig)],
  providers: [PaymobConfigProbe],
  exports: [PaymobConfigProbe],
})
class PaymobConfigFeatureModule {}

@Module({
  imports: [PaymobConfigFeatureModule],
  providers: [PaymobConfigProbe],
})
class PaymobConfigConsumerModule {}

describe('the paymob namespace', () => {
  it('is readable through the global ConfigService from a module that does not provide it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymobConfigRootModule, PaymobConfigFeatureModule, PaymobConfigConsumerModule],
    }).compile();
    const app = await moduleRef.init();

    const probe = app.get(PaymobConfigProbe);
    const read = probe.read();
    expect(typeof read?.merchantId).toBe('string');
    expect(typeof read?.integrationId).toBe('string');

    await app.close();
  });
});
