import { OAUTH_PLACEHOLDER_EMAIL_DOMAIN, type OAuthProvider } from '../types/oauth.types.ts';

/**
 * WHY: OAuth providers are inconsistent about a missing email. Facebook and GitHub declare it
 * nullish and will return `''`; Apple may omit it; TikTok has no email field at all. The service
 * used to fall back with `||`, which handled every one of those, and was then changed to `??` to
 * satisfy a lint rule — silently dropping the blank cases. `findOrCreateOAuthUser` then wrote
 * `email: ''`, and since the unique index treats all blank emails as the same value, the second
 * such sign-in either collided or bypassed the constraint that makes accounts unique.
 *
 * The invariant is "blank is absent", so it is decided once, here, and every provider goes
 * through it (Principle #9). The fallback is derived from the provider's own account id, so two
 * providers that withhold their email still get distinct, reproducible addresses.
 */
export function resolveOAuthEmail(
  rawEmail: string | null | undefined,
  provider: OAuthProvider,
  providerId: string,
): string {
  const candidate = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (candidate.length > 0) {
    return candidate;
  }

  return `${providerId}@${OAUTH_PLACEHOLDER_EMAIL_DOMAIN[provider]}`;
}
