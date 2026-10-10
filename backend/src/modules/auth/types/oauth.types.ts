/**
 * WHY this file exists: the provider list, the per-provider user column, and the per-provider
 * placeholder email domain are one fact each, and the auth service used to spell them out at
 * three separate call sites. They are values and types, so they live here (Principle #10) and
 * every consumer reads them from here (Principle #9).
 */
export const OAUTH_PROVIDERS = ['google', 'facebook', 'github', 'apple', 'tiktok'] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

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
