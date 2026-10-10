import { describe, it, expect } from 'vitest';

import { NON_PRODUCTION_JWT_SECRET, NON_PRODUCTION_REFRESH_TOKEN_SECRET, buildJwtConfig } from './jwt.config.ts';

const REAL_JWT_SECRET = 'a-unique-access-secret-for-this-deployment-only-abc123';
const REAL_REFRESH_SECRET = 'a-unique-refresh-secret-for-this-deployment-only-xyz789';

describe('buildJwtConfig outside production', () => {
  it('falls back to the documented development secrets so local work and the suite need no env', () => {
    const config = buildJwtConfig({});

    expect(config.secret).toBe(NON_PRODUCTION_JWT_SECRET);
    expect(config.refreshSecret).toBe(NON_PRODUCTION_REFRESH_TOKEN_SECRET);
    expect(config.expiry).toBe('15m');
    expect(config.refreshExpiry).toBe('7d');
  });

  it('treats a blank variable as not configured rather than as a zero-length secret', () => {
    const config = buildJwtConfig({ JWT_SECRET: '', REFRESH_TOKEN_SECRET: '' });

    expect(config.secret).toBe(NON_PRODUCTION_JWT_SECRET);
    expect(config.refreshSecret).toBe(NON_PRODUCTION_REFRESH_TOKEN_SECRET);
  });

  it('uses the configured secrets and expiries when they are set', () => {
    const config = buildJwtConfig({
      JWT_SECRET: REAL_JWT_SECRET,
      REFRESH_TOKEN_SECRET: REAL_REFRESH_SECRET,
      JWT_EXPIRY: '30m',
      REFRESH_TOKEN_EXPIRY: '12h',
    });

    expect(config).toEqual({
      secret: REAL_JWT_SECRET,
      expiry: '30m',
      refreshSecret: REAL_REFRESH_SECRET,
      refreshExpiry: '12h',
      appleClientId: '',
    });
  });

  it.each(['development', 'test', 'staging'])('accepts the development default under NODE_ENV=%s', (nodeEnv) => {
    expect(buildJwtConfig({ NODE_ENV: nodeEnv }).secret).toBe(NON_PRODUCTION_JWT_SECRET);
  });

  it('rejects a secret that is too short in every environment', () => {
    expect(() => buildJwtConfig({ JWT_SECRET: 'short' })).toThrow('JWT_SECRET must be at least 32 characters');
    expect(() => buildJwtConfig({ REFRESH_TOKEN_SECRET: 'short' })).toThrow(
      'REFRESH_TOKEN_SECRET must be at least 32 characters',
    );
  });
});

describe('buildJwtConfig in production', () => {
  const production = { NODE_ENV: 'production' };

  it('refuses to boot on the publicly known default access secret', () => {
    expect(() => buildJwtConfig(production)).toThrow('JWT_SECRET is still a publicly known placeholder');
  });

  it('refuses to boot when only the access secret was left unset', () => {
    expect(() => buildJwtConfig({ ...production, REFRESH_TOKEN_SECRET: REAL_REFRESH_SECRET })).toThrow(
      'JWT_SECRET is still a publicly known placeholder',
    );
  });

  it('refuses to boot when only the refresh secret was left unset', () => {
    expect(() => buildJwtConfig({ ...production, JWT_SECRET: REAL_JWT_SECRET })).toThrow(
      'REFRESH_TOKEN_SECRET is still a publicly known placeholder',
    );
  });

  it('refuses the placeholder that ships in .env.example, which is just as public as the default', () => {
    expect(() =>
      buildJwtConfig({
        ...production,
        JWT_SECRET: 'your-jwt-secret-key-here-change-in-production',
        REFRESH_TOKEN_SECRET: 'your-refresh-token-secret-here-change-in-production',
      }),
    ).toThrow('publicly known placeholder');
  });

  it('refuses to boot on the default refresh secret even when the access secret is unique', () => {
    expect(() => buildJwtConfig({ ...production, JWT_SECRET: REAL_JWT_SECRET })).toThrow(
      'REFRESH_TOKEN_SECRET is still a publicly known placeholder',
    );
  });

  it('starts on a pair of secrets the operator chose', () => {
    const config = buildJwtConfig({
      ...production,
      JWT_SECRET: REAL_JWT_SECRET,
      REFRESH_TOKEN_SECRET: REAL_REFRESH_SECRET,
    });

    expect(config.secret).toBe(REAL_JWT_SECRET);
    expect(config.refreshSecret).toBe(REAL_REFRESH_SECRET);
  });

  it('explains itself in one readable line rather than a ZodError JSON dump', () => {
    let message = '';

    try {
      buildJwtConfig(production);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Refusing to start with an unsafe JWT configuration');
    expect(message).toContain('openssl rand -base64 48');
    expect(message).not.toContain('ZodError');
    expect(message).not.toContain('[{');
  });
});
