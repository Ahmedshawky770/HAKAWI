import { registerAs } from '@nestjs/config';
import { z } from 'zod';

/**
 * Paymob runs test and live on the SAME regional host. From Paymob's own documentation: "Test and
 * live use the same regional base URL for each region. The mode is controlled by the keys and
 * Integration IDs you use." A test key against a live Integration ID returns 404 on creation, which
 * is the failure this module has to prevent — not a URL mismatch.
 *
 * TWO CONSTANTS THAT ARE IDENTICAL, DELIBERATELY. `PAYMOB_SANDBOX_BASE_URL` and
 * `PAYMOB_LIVE_BASE_URL` were previously reported as a defect on the grounds that "sandbox mode
 * authenticates against the live host". That was wrong, and it is worth recording why: the names
 * invite exactly that reading, which is why each constant now carries the host's meaning in its own
 * comment. If Paymob ever does introduce a separate sandbox host, this is the one line that changes.
 *
 * The genuinely load-bearing distinction is the credential-mode pair below, which is enforced at boot.
 */
export const PAYMOB_SANDBOX_BASE_URL = 'https://accept.paymob.com/api';
export const PAYMOB_LIVE_BASE_URL = 'https://accept.paymob.com/api';

/**
 * The placeholder credentials, and the boot-time guard that refuses them in production.
 *
 * `PAYMOB_API_KEY`, `PAYMOB_MERCHANT_ID` and `PAYMOB_INTEGRATION_ID` each carried a `sandbox-*`
 * default with NO production guard, while the webhook secret beside them had one. The comment above
 * `envSchema` claimed the opposite — that "a deployment that forgets the variable now stops at boot"
 * — which was true for the webhook secret and false for the three that decide whether a payment can
 * happen at all. The failure mode was silent and total: a production deployment that copied
 * `.env.example` booted healthy, answered `/health` with `database: connected`, and failed every real
 * checkout.
 */
const PUBLICLY_KNOWN_PAYMOB_CREDENTIALS: ReadonlySet<string> = new Set([
  'sandbox-paymob-api-key',
  'sandbox-merchant-id',
  'sandbox-integration-id',
]);

export const PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS = 3600;

export const PAYMOB_CONFIG = 'PAYMOB_CONFIG';

/**
 * The namespace this configuration is registered under, in ONE place.
 *
 * `registerAs('paymob', …)` puts the resolved configuration into the shared config host under this
 * key, and the `PAYMOB_CONFIG` token provider reads it back with `configService.get('paymob')`.
 * Anything else that needs the same object — the books module, which resolves the reader's choice
 * of instrument — reads it under this same name rather than under a literal of its own, so the two
 * can never drift onto different namespaces.
 */
export const PAYMOB_CONFIG_NAMESPACE = 'paymob';

/**
 * THE INSTRUMENT VOCABULARY THE READER CHOOSES FROM.
 *
 * These are the two things a reader can pick on the checkout panel, and they are SEMANTIC: "card"
 * and "wallet" are a choice, not a gateway handle. Paymob wants a merchant-specific numeric id for
 * each of them, and this codebase cannot know that number — so the choice is resolved against the
 * configuration below, in exactly one place.
 *
 * The list is the single source of truth for the API (`PurchaseBookDto`) and for the resolution
 * helper, so the vocabulary the API accepts and the vocabulary the resolver understands are the
 * same two words.
 */
export const PAYMOB_PAYMENT_METHOD_CHOICES = ['card', 'wallet'] as const;

export type PaymobPaymentMethodChoice = (typeof PAYMOB_PAYMENT_METHOD_CHOICES)[number];

export const paymobPaymentMethodChoiceSchema = z.enum(PAYMOB_PAYMENT_METHOD_CHOICES);

/**
 * WHY a default exists at all: the unit suite and local development boot the payments module with
 * no environment at all, and a webhook secret with no value would fail the minimum-length rule for
 * every one of them. This is a *development* value, not a fallback — `envSchema` refuses it whenever
 * `NODE_ENV=production`, so a deployment that forgets the variable stops at boot instead of quietly
 * running a webhook endpoint that rejects every delivery as unsigned.
 *
 * WHAT THAT CLAIM USED TO OVERSTATE. It sat directly above a schema whose ONLY production guard
 * covered the webhook secret. `PAYMOB_API_KEY`, `PAYMOB_MERCHANT_ID` and `PAYMOB_INTEGRATION_ID`
 * carried `sandbox-*` defaults with no guard at all, so "a deployment that forgets the variable now
 * stops at boot" was true of one variable out of four — and false of the three that decide whether a
 * payment can happen. All four are guarded now; see `PUBLICLY_KNOWN_PAYMOB_CREDENTIALS`.
 */
export const NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET = 'default-paymob-webhook-secret-for-development-only-1234567890';

/**
 * WHY the `.env.example` placeholder is refused too: it ships in the repository, so it is public.
 * A deployment that copies the example file verbatim is exactly as unsigned as one that sets
 * nothing. (Principle #15 — the mistake is caught at the boundary rather than by hoping an
 * operator read the file.)
 */
const PUBLICLY_KNOWN_WEBHOOK_SECRETS: ReadonlySet<string> = new Set([
  NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET,
  'your-webhook-secret',
]);

const MIN_WEBHOOK_SECRET_LENGTH = 32;

/**
 * THE PAYMENT METHOD IDS, AND WHY THEY ARE OPTIONAL AND UNGUARDED.
 *
 * Paymob's `payment_keys` endpoint accepts a `payment_method_id`: the MERCHANT'S OWN numeric id for
 * one instrument — a card, a mobile wallet. It differs per account, per integration and per
 * country, and it is not discoverable from this codebase, so it is read from the environment rather
 * than written here.
 *
 * WHY OPTIONAL, AND WHY THERE IS NO PRODUCTION GUARD. An absent id means the gateway is not told
 * which instrument to use, and Paymob then asks the CUSTOMER to choose inside the payment frame.
 * That is exactly the behaviour this codebase had before the reader's choice existed, so an unset
 * variable costs the FEATURE and nothing else: the reader picks an instrument in the checkout panel
 * and the gateway asks again. The alternative — refusing to boot, or failing the purchase — would
 * turn an optional convenience into an outage, and would do it over a value the operator may simply
 * not have for this merchant yet.
 *
 * A blank value means "not configured" for the same reason an unset one does: a deployment that
 * exports the variable empty has not configured it, and must not be answered with a boot failure.
 */
const paymentMethodIdSchema = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim().length === 0 ? undefined : value.trim()))
  .refine((value) => value === undefined || /^[1-9]\d*$/.test(value), {
    message: 'must be a positive integer id',
  });

/**
 * An unset variable and a blank one mean the same thing, and both mean "not configured".
 * Reading an absent variable as the development value keeps local work and the test suite
 * ergonomic; production rejects that value by name in the object-level check below.
 */
const webhookSecretSchema = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.length === 0 ? NON_PRODUCTION_PAYMOB_WEBHOOK_SECRET : value))
  .refine((value) => value.length >= MIN_WEBHOOK_SECRET_LENGTH, {
    message: `PAYMOB_WEBHOOK_SECRET must be at least ${MIN_WEBHOOK_SECRET_LENGTH} characters`,
  });

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    PAYMOB_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
    PAYMOB_API_KEY: z.string().min(1, 'PAYMOB_API_KEY must be set').default('sandbox-paymob-api-key'),
    PAYMOB_SANDBOX_API_KEY: z.string().min(1).optional(),
    PAYMOB_MERCHANT_ID: z.string().min(1, 'PAYMOB_MERCHANT_ID must be set').default('sandbox-merchant-id'),
    PAYMOB_INTEGRATION_ID: z.string().min(1, 'PAYMOB_INTEGRATION_ID must be set').default('sandbox-integration-id'),
    PAYMOB_SANDBOX_INTEGRATION_ID: z.string().min(1).optional(),
    PAYMOB_WEBHOOK_SECRET: webhookSecretSchema,
    PAYMOB_CARD_PAYMENT_METHOD_ID: paymentMethodIdSchema,
    PAYMOB_WALLET_PAYMENT_METHOD_ID: paymentMethodIdSchema,
    PAYMOB_BASE_URL: z.string().url('PAYMOB_BASE_URL must be an absolute URL').optional(),
    PAYMOB_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
    PAYMOB_AUTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(8_000),
    PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(3000),
    PAYMOB_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(0).max(10).default(2),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    // The three credentials that decide whether a payment can be taken at all. Checked BEFORE the
    // webhook secret so the message an operator sees first names the thing that actually breaks the
    // product rather than the thing that would have broken it second.
    for (const [path, value] of [
      ['PAYMOB_API_KEY', env.PAYMOB_API_KEY],
      ['PAYMOB_MERCHANT_ID', env.PAYMOB_MERCHANT_ID],
      ['PAYMOB_INTEGRATION_ID', env.PAYMOB_INTEGRATION_ID],
    ] as const) {
      if (PUBLICLY_KNOWN_PAYMOB_CREDENTIALS.has(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message:
            `${path} is still the published sandbox placeholder. Paymob distinguishes test from live by ` +
            'the KEYS, not by the host — both modes use the same regional base URL — so a production ' +
            'deployment with these values boots, reports healthy, and fails every real checkout with a ' +
            'gateway error. Set the live values from the Paymob dashboard (Settings > Account Info) ' +
            'before starting in production.',
        });
      }
    }

    // A live deployment configured with sandbox keys is the same failure with different values, and
    // this one is the operator's own mistake rather than a forgotten variable — so it is caught too.
    if (env.PAYMOB_ENVIRONMENT === 'sandbox' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMOB_ENVIRONMENT'],
        message:
          'PAYMOB_ENVIRONMENT is `sandbox` while NODE_ENV is `production`. Paymob selects the mode from ' +
          'the keys, so a sandbox configuration in production takes no real money and the module looks ' +
          'healthy while every checkout fails. Set PAYMOB_ENVIRONMENT=live together with the live keys.',
      });
    }

    if (PUBLICLY_KNOWN_WEBHOOK_SECRETS.has(env.PAYMOB_WEBHOOK_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMOB_WEBHOOK_SECRET'],
        message:
          'PAYMOB_WEBHOOK_SECRET is still a publicly known placeholder. Set a unique value of at least ' +
          `${MIN_WEBHOOK_SECRET_LENGTH} characters before starting in production (for example: openssl rand -base64 48). ` +
          'Without it every Paymob webhook delivery is rejected as unsigned.',
      });
    }
  });

export type PaymobEnvironment = 'sandbox' | 'live';

export type PaymobConfig = {
  readonly environment: PaymobEnvironment;
  readonly apiKey: string;
  readonly merchantId: string;
  readonly integrationId: string;
  readonly webhookSecret: string;
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly authTimeoutMs: number;
  readonly authTokenCacheTtlSeconds: number;
  readonly retryMaxAttempts: number;
  /**
   * The merchant's Paymob id for the CARD instrument, when the deployment has configured one.
   *
   * Optional, and absent means "the gateway asks the customer" — see the note on
   * `paymentMethodIdSchema`.
   */
  readonly cardPaymentMethodId?: string;
  /**
   * The merchant's Paymob id for the MOBILE WALLET instrument, when the deployment has configured
   * one. Optional, with the same meaning as {@link PaymobConfig.cardPaymentMethodId}.
   */
  readonly walletPaymentMethodId?: string;
};

/**
 * THE ONE PLACE A READER'S CHOICE BECOMES A GATEWAY INSTRUMENT.
 *
 * The reader picks "card" or "wallet" — a SEMANTIC choice, in words they recognise. Paymob wants a
 * numeric id that is specific to this merchant. This function is the translation between the two,
 * and it is the ONLY place it happens: everything upstream of it deals in the choice, everything
 * downstream of it deals in the id.
 *
 * WHY IT RETURNS `undefined` RATHER THAN FAILING. A missing configuration value is not an error —
 * it means this deployment has not told the gateway which instrument to use, and the gateway then
 * asks the customer inside the payment frame, which is the behaviour the product had before the
 * choice existed. Failing the purchase over an optional convenience would cost a reader a book
 * because an operator had not filled in a number.
 */
export function resolvePaymobPaymentMethodId(
  config: Pick<PaymobConfig, 'cardPaymentMethodId' | 'walletPaymentMethodId'> | undefined,
  choice: PaymobPaymentMethodChoice | undefined,
): string | undefined {
  if (config === undefined || choice === undefined) {
    return undefined;
  }
  // The choice is PARSED, not compared. A word this resolver does not know resolves to NOTHING —
  // which leaves the gateway to ask the customer — rather than falling through to the wallet id,
  // which would quietly charge a reader through an instrument they did not choose.
  const parsed = paymobPaymentMethodChoiceSchema.safeParse(choice);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data === 'card' ? config.cardPaymentMethodId : config.walletPaymentMethodId;
}

export function normalizePaymobBaseUrl(rawBaseUrl: string): string {
  const withoutTrailingSlash = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(withoutTrailingSlash)) {
    throw new Error(`PAYMOB_BASE_URL must be an http(s) URL, received "${rawBaseUrl}"`);
  }
  return withoutTrailingSlash.toLowerCase().endsWith('/api') ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
}

export function resolvePaymobConfig(env: NodeJS.ProcessEnv = process.env): PaymobConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // WHY not the raw ZodError: a boot failure has to be readable in the first line of a log an
    // operator sees, and ZodError's message is a JSON dump of its issue list.
    throw new Error(
      `Refusing to start with an unsafe Paymob configuration: ${parsed.error.issues
        .map((issue) => issue.message)
        .join(' ')}`,
    );
  }
  const environment: PaymobEnvironment = parsed.data.PAYMOB_ENVIRONMENT;
  const isSandbox = environment === 'sandbox';

  const apiKey = isSandbox
    ? (parsed.data.PAYMOB_SANDBOX_API_KEY ?? parsed.data.PAYMOB_API_KEY)
    : parsed.data.PAYMOB_API_KEY;
  const integrationId = isSandbox
    ? (parsed.data.PAYMOB_SANDBOX_INTEGRATION_ID ?? parsed.data.PAYMOB_INTEGRATION_ID)
    : parsed.data.PAYMOB_INTEGRATION_ID;

  const baseUrl = normalizePaymobBaseUrl(
    parsed.data.PAYMOB_BASE_URL ?? (isSandbox ? PAYMOB_SANDBOX_BASE_URL : PAYMOB_LIVE_BASE_URL),
  );

  return {
    environment,
    apiKey,
    merchantId: parsed.data.PAYMOB_MERCHANT_ID,
    integrationId,
    webhookSecret: parsed.data.PAYMOB_WEBHOOK_SECRET,
    baseUrl,
    requestTimeoutMs: parsed.data.PAYMOB_REQUEST_TIMEOUT_MS,
    authTimeoutMs: parsed.data.PAYMOB_AUTH_TIMEOUT_MS,
    authTokenCacheTtlSeconds: Math.min(
      parsed.data.PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS,
      PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS - 60,
    ),
    retryMaxAttempts: parsed.data.PAYMOB_RETRY_MAX_ATTEMPTS,
    cardPaymentMethodId: parsed.data.PAYMOB_CARD_PAYMENT_METHOD_ID,
    walletPaymentMethodId: parsed.data.PAYMOB_WALLET_PAYMENT_METHOD_ID,
  };
}

export default registerAs(PAYMOB_CONFIG_NAMESPACE, () => resolvePaymobConfig());
