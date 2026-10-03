import { z } from 'zod';

/**
 * WHY THIS FILE EXISTS (Principle #9 — Single Source of Truth).
 *
 * The rule "a secret that ships in this repository is not a secret" was written twice, once in
 * `jwt.config.ts` and once in `paymob.config.ts`, and both copies had to be kept in step by hand.
 * The third copy was about to be written for `ENCRYPTION_KEY`. Three copies of one security rule
 * is three places for the rule to drift, so the rule now lives here exactly once and each config
 * supplies only the names it owns.
 *
 * WHAT IS *NOT* HERE ON PURPOSE: `paymob.config.ts` keeps its own set. Its message carries
 * domain-specific consequences ("every Paymob webhook delivery is rejected as unsigned") and its
 * placeholder (`your-webhook-secret`) is a fourth variable's concern, not a third copy of this
 * rule. Folding it in would mean overwriting a better message with a generic one.
 */

export const MIN_SECRET_LENGTH = 32;

/**
 * Every value that is *published in this repository* and therefore known to anyone who has read
 * it. Shipping a placeholder in `.env.example` is the same exposure as shipping no variable at
 * all, so production refuses these by name (Principle #15 — catch the mistake at the boundary
 * rather than hoping the operator read the comment beside the value).
 *
 * `.env.example` is the source these strings are copied from: changing a placeholder there without
 * adding it here turns a loud boot failure back into a silent deployment running on a public key.
 */
export const PUBLICLY_KNOWN_SECRETS: ReadonlySet<string> = new Set([
  // `jwt.config.ts`
  'default-jwt-secret-for-testing-only-change-in-production-1234567890',
  'default-refresh-secret-for-testing-only-change-in-production-1234567890',
  'your-jwt-secret-key-here-change-in-production',
  'your-refresh-token-secret-here-change-in-production',
  // `encryption.config.ts`
  'your-encryption-key-here-change-in-production',
]);

/**
 * WHY ONE MESSAGE FOR ALL OF THEM: an operator who fixed `JWT_SECRET` at 02:00 and now reads
 * "REFRESH_TOKEN_SECRET is still a publicly known placeholder" knows immediately what to do and
 * how to check that what they picked is unique. The command that generates an acceptable value is
 * named in the message because "choose a unique secret" is not actionable on its own.
 */
export function productionSecretError(name: string): string {
  return (
    `${name} is still a publicly known placeholder. Set a unique value of at least ${MIN_SECRET_LENGTH} characters ` +
    'before starting in production (for example: openssl rand -base64 48).'
  );
}

/**
 * WHY a default exists at all: the unit suite boots pieces of the auth stack with no environment at
 * all, and a secret with no value would fail the minimum-length rule for every one of them. These
 * values are therefore *development* values, not fallbacks — the caller's `superRefine` refuses
 * them whenever NODE_ENV=production, so a deployment that forgets its environment stops at boot
 * instead of minting tokens that anybody who has read this repository can forge.
 *
 * An unset variable and a blank one mean the same thing, and both mean "not configured". Reading
 * an absent variable as the development value keeps local work and the test suite ergonomic.
 */
export function secretSchema(name: string, nonProductionValue: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? nonProductionValue : value))
    .refine((value) => value.length >= MIN_SECRET_LENGTH, {
      message: `${name} must be at least ${MIN_SECRET_LENGTH} characters`,
    });
}

/**
 * The production-only half of the rule, shared by every config that owns a secret.
 *
 * Returns the first variable in `values` that is publicly known, or `undefined` when the
 * configuration is acceptable. Returning the name rather than throwing keeps the decision inside
 * the Zod `superRefine` that reports it with a `path`, so the operator sees *which* variable to fix
 * rather than an opaque boot failure.
 */
export function findPubliclyKnownSecret(nodeEnv: string, values: Readonly<Record<string, string>>): string | undefined {
  if (nodeEnv !== 'production') {
    return undefined;
  }
  return Object.keys(values).find((name) => PUBLICLY_KNOWN_SECRETS.has(values[name] ?? ''));
}

/**
 * WHY not the raw ZodError: a boot failure has to be readable in the first line of a log an
 * operator sees, and ZodError's message is a JSON dump of its issue list. The operator hits this
 * at deploy time, which is the worst moment to hand them a stack trace of a JSON array.
 */
export function unsafeConfigurationError(subject: string, messages: readonly string[]): Error {
  return new Error(`Refusing to start with an unsafe ${subject} configuration: ${messages.join(' ')}`);
}
