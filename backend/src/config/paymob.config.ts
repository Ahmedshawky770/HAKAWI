import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export const PAYMOB_SANDBOX_BASE_URL = 'https://accept.paymob.com/api';
export const PAYMOB_LIVE_BASE_URL = 'https://accept.paymob.com/api';

export const PAYMOB_AUTH_TOKEN_LIFETIME_SECONDS = 3600;

export const PAYMOB_CONFIG = 'PAYMOB_CONFIG';

/**
 * WHY a default exists at all: the unit suite and local development boot the payments module with
 * no environment at all, and a webhook secret with no value would fail the minimum-length rule for
 * every one of them. This is a *development* value, not a fallback — `envSchema` refuses it whenever
 * `NODE_ENV=production`, so a deployment that forgets the variable now stops at boot instead of
 * quietly running a webhook endpoint that rejects every delivery as unsigned.
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
};

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
  };
}

export default registerAs('paymob', () => resolvePaymobConfig());
