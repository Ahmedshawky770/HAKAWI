/**
 * WHY this file exists: the per-provider user column and the per-provider placeholder email domain
 * are one fact each, and the auth service used to spell them out at three separate call sites. They
 * are values and types, so they live here (Principle #10) and every consumer reads them from here
 * (Principle #9).
 *
 * The provider LIST itself is not defined here any more: the frontend renders one sign-in control
 * per provider, so the list is a cross-stack contract and lives in `@hakawi/shared-types` next to
 * the account types. It is re-exported from here because every backend consumer — including the
 * guard that rejects an unknown `:provider` path parameter — already imports it from this module,
 * and a renamed import buys nothing.
 */
import type { OAuthProvider } from '@hakawi/shared-types';

export { OAUTH_PROVIDERS, isOAuthProvider, type OAuthProvider } from '@hakawi/shared-types';

/**
 * The users column that holds the provider's account id. Creating a user without filling the
 * column for the provider that authenticated it is how a second sign-in becomes a duplicate
 * account, so the mapping is data rather than a switch.
 */
export const OAUTH_PROVIDER_ID_FIELD: Readonly<Record<OAuthProvider, string>> = {
  google: 'googleId',
  facebook: 'facebookId',
  github: 'githubId',
  apple: 'appleId',
  tiktok: 'tiktokId',
};

/**
 * The reserved domain used for accounts whose provider withheld the email. It cannot be a real
 * address: it is a `.user` namespace that no public mail exchanger serves, so a sign-in that
 * resolves to it can never collide with a real inbox on the unique email index.
 */
export const OAUTH_PLACEHOLDER_EMAIL_DOMAIN: Readonly<Record<OAuthProvider, string>> = {
  google: 'google.user',
  facebook: 'facebook.user',
  github: 'github.user',
  apple: 'apple.user',
  tiktok: 'tiktok.user',
};
