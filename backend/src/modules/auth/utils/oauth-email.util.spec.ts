import { describe, it, expect } from 'vitest';

import { OAUTH_PLACEHOLDER_EMAIL_DOMAIN, OAUTH_PROVIDER_ID_FIELD, isOAuthProvider } from '../types/oauth.types.ts';

import { resolveOAuthEmail } from './oauth-email.util.ts';

describe('resolveOAuthEmail', () => {
  it('keeps an address the provider did return', () => {
    expect(resolveOAuthEmail('keeper@hakawi.com', 'facebook', 'fb-1')).toBe('keeper@hakawi.com');
  });

  it('trims a padded address so the unique index sees the same value as the login form', () => {
    expect(resolveOAuthEmail('  keeper@hakawi.com  ', 'google', 'g-1')).toBe('keeper@hakawi.com');
  });

  // WHY these four are named individually: `??` covers null and undefined only. A provider that
  // answers with "" or "   " passed the nullish schema unchanged and used to be persisted as the
  // account's email, so every such sign-in competed for the same unique value.
  it.each([
    { label: 'an empty string', raw: '' },
    { label: 'a whitespace-only string', raw: '   ' },
    { label: 'a tab and newline', raw: '\t\n' },
    { label: 'null', raw: null },
    { label: 'undefined', raw: undefined },
  ])('treats $label as an absent email and derives the placeholder', ({ raw }) => {
    expect(resolveOAuthEmail(raw, 'facebook', 'fb-42')).toBe('fb-42@facebook.user');
  });

  it('derives a distinct placeholder per provider from the provider account id', () => {
    expect(resolveOAuthEmail(undefined, 'google', 'g-1')).toBe('g-1@google.user');
    expect(resolveOAuthEmail('', 'github', '42')).toBe('42@github.user');
    expect(resolveOAuthEmail(null, 'apple', 'apple-sub')).toBe('apple-sub@apple.user');
    expect(resolveOAuthEmail(null, 'tiktok', 'tt-9')).toBe('tt-9@tiktok.user');
  });

  it('never produces a blank address, whatever the input', () => {
    for (const raw of ['', '   ', null, undefined]) {
      expect(resolveOAuthEmail(raw, 'github', '7').length).toBeGreaterThan(0);
      expect(resolveOAuthEmail(raw, 'github', '7')).toContain('@');
    }
  });

  it('covers every supported provider, so a new provider cannot be added without a placeholder', () => {
    for (const provider of ['google', 'facebook', 'github', 'apple', 'tiktok'] as const) {
      const derived = resolveOAuthEmail(undefined, provider, 'id-1');

      expect(derived).toBe(`id-1@${OAUTH_PLACEHOLDER_EMAIL_DOMAIN[provider]}`);
      expect(OAUTH_PROVIDER_ID_FIELD[provider]).toMatch(/Id$/);
    }
  });
});

describe('isOAuthProvider', () => {
  it.each(['google', 'facebook', 'github', 'apple', 'tiktok'])('accepts %s', (provider) => {
    expect(isOAuthProvider(provider)).toBe(true);
  });

  it.each(['', 'GOOGLE', 'twitter', 'unknown', 'google '])('rejects %j rather than widening the union', (provider) => {
    expect(isOAuthProvider(provider)).toBe(false);
  });
});
