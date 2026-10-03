import { z } from 'zod';

import { findPubliclyKnownSecret, productionSecretError, unsafeConfigurationError } from './public-secret.ts';

/**
 * WHY THIS CONFIG EXISTS.
 *
 * `EncryptionService` used to read `ENCRYPTION_KEY` and throw only when it was *absent*. That
 * accepted the literal `your-encryption-key-here-change-in-production` that `backend/.env.example`
 * ships — a value published in this repository, and therefore known to anyone who has read it.
 *
 * WHY THAT MATTERS HERE AND NOT MERELY IN PRINCIPLE: this key encrypts password-reset tokens
 * (`auth.service.ts` encrypts on request and decrypts on redemption) and the GCM auth tag is
 * compared on redemption, so the key is what makes an intercepted reset token unreadable. A
 * deployment that copies `.env.example` and changes the two JWT secrets — the documented minimum —
 * was running with a reset-token key that had been published since the file was written.
 *
 * WHY IT REUSES `public-secret.ts` RATHER THAN OPENING ITS OWN LIST: the rule "a value published in
 * this repository is not a secret" must have exactly one definition, or the next config added will
 * implement it a third time and a placeholder will be added to one list and not the other
 * (Principle #9).
 */

/**
 * WHY NO MINIMUM LENGTH HERE, WHEN `JWT_SECRET` HAS ONE: scrypt stretches whatever it is given, so
 * a short key is stretched into a full-length AES key rather than rejected — the existing
 * behaviour, and the correct one for a KDF. Character count is a poor proxy for the property that
 * actually matters here, which is that the value is *unique and unpredictable*, and that is exactly
 * what the production placeholder rule below checks.
 */
const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    /**
     * WHY `required_error`, `invalid_type_error` AND `min(1)` ARE ALL SET: without them an unset
     * variable produces Zod's default "Required" / "Invalid input: expected string", which names
     * neither the variable nor the action. The three messages are identical on purpose — absent,
     * blank and non-string all mean the same thing to an operator reading a boot log: set the
     * variable. An empty string is treated as absent rather than accepted, because scrypt would
     * happily stretch `''` into a perfectly valid AES key that every deployment in the world would
     * share.
     */
    ENCRYPTION_KEY: z
      .string({
        required_error: 'ENCRYPTION_KEY must be configured',
        invalid_type_error: 'ENCRYPTION_KEY must be configured',
      })
      .min(1, 'ENCRYPTION_KEY must be configured'),
  })
  .superRefine((env, ctx) => {
    const offending = findPubliclyKnownSecret(env.NODE_ENV, { ENCRYPTION_KEY: env.ENCRYPTION_KEY });
    if (offending !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [offending], message: productionSecretError(offending) });
    }
  });

export interface EncryptionConfig {
  /** The operator-supplied secret. Stretched to 32 bytes with scrypt before it becomes an AES key. */
  readonly key: string;
}

/**
 * NOT `registerAs('encryption', …)` ON PURPOSE.
 *
 * Every other config in this directory registers a namespace because a *service* reads the finished
 * value out of `ConfigService`. Here `EncryptionService` owns the derivation — it stretches the
 * secret into the AES key it needs — so there is no second derived value for a namespace to hold.
 * Publishing a validated-but-unstretched `encryption.key` would create a second, less useful
 * representation of the same secret for no reader (Principle #9).
 */
export function buildEncryptionConfig(source: NodeJS.ProcessEnv = process.env): EncryptionConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw unsafeConfigurationError(
      'encryption',
      parsed.error.issues.map((issue) => issue.message),
    );
  }

  return { key: parsed.data.ENCRYPTION_KEY };
}
