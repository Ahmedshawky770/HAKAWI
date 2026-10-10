import { registerAs } from '@nestjs/config';
import { z } from 'zod';

import {
  findPubliclyKnownSecret,
  productionSecretError,
  secretSchema,
  unsafeConfigurationError,
} from './public-secret.ts';

/**
 * WHY these two values exist: see `secretSchema` in `public-secret.ts`. They are *development*
 * values, not fallbacks — the production check below refuses them by name, so a deployment that
 * forgets its environment now stops at boot instead of minting tokens that anybody who has read
 * this repository can forge.
 *
 * WHY the public-placeholder rule is not spelled out here: `PUBLICLY_KNOWN_SECRETS` in
 * `public-secret.ts` is the one list, shared with `encryption.config.ts` so the two configs cannot
 * disagree about which values are public (Principle #9).
 */
export const NON_PRODUCTION_JWT_SECRET = 'default-jwt-secret-for-testing-only-change-in-production-1234567890';
export const NON_PRODUCTION_REFRESH_TOKEN_SECRET =
  'default-refresh-secret-for-testing-only-change-in-production-1234567890';

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    JWT_SECRET: secretSchema('JWT_SECRET', NON_PRODUCTION_JWT_SECRET),
    JWT_EXPIRY: z.string().default('15m'),
    REFRESH_TOKEN_SECRET: secretSchema('REFRESH_TOKEN_SECRET', NON_PRODUCTION_REFRESH_TOKEN_SECRET),
    REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
    /**
     * The Apple application client id, used as the required `aud` of an Apple `id_token`.
     *
     * Read here rather than from `process.env` inside the verifier so the audience check reads
     * the same validated configuration the secret does, and so an unset value is visible as a
     * configuration gap instead of silently becoming "accept whatever audience is presented".
     */
    APPLE_CLIENT_ID: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const offending = findPubliclyKnownSecret(env.NODE_ENV, {
      JWT_SECRET: env.JWT_SECRET,
      REFRESH_TOKEN_SECRET: env.REFRESH_TOKEN_SECRET,
    });
    if (offending !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [offending], message: productionSecretError(offending) });
    }
  });

export interface JwtConfig {
  readonly secret: string;
  readonly expiry: string;
  readonly refreshSecret: string;
  readonly refreshExpiry: string;
  /** Required `aud` for an Apple `id_token`. Empty means Apple sign-in is not configured. */
  readonly appleClientId: string;
}

export function buildJwtConfig(source: NodeJS.ProcessEnv = process.env): JwtConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw unsafeConfigurationError(
      'JWT',
      parsed.error.issues.map((issue) => issue.message),
    );
  }

  return {
    secret: parsed.data.JWT_SECRET,
    expiry: parsed.data.JWT_EXPIRY,
    refreshSecret: parsed.data.REFRESH_TOKEN_SECRET,
    refreshExpiry: parsed.data.REFRESH_TOKEN_EXPIRY,
    appleClientId: parsed.data.APPLE_CLIENT_ID ?? '',
  };
}

export default registerAs('jwt', () => buildJwtConfig());
