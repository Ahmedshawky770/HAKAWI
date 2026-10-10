import { describe, it, expect } from 'vitest';

import { PUBLICLY_KNOWN_SECRETS, findPubliclyKnownSecret, productionSecretError } from './public-secret.ts';
import { buildEncryptionConfig } from './encryption.config.ts';

/** The literal `backend/.env.example` ships. Read from the real file, so a rename cannot pass here. */
const PLACEHOLDER_FROM_ENV_EXAMPLE = 'your-encryption-key-here-change-in-production';

const REAL_KEY = 'a-unique-encryption-key-for-this-deployment-only-qrs456';

describe('PUBLICLY_KNOWN_SECRETS', () => {
  it('contains the placeholder that ships in backend/.env.example', () => {
    // WHY assert against the literal and not the import: the failure mode being guarded against is
    // the placeholder and the list drifting apart, which an import from the same list cannot see.
    expect(PUBLICLY_KNOWN_SECRETS.has(PLACEHOLDER_FROM_ENV_EXAMPLE)).toBe(true);
  });

  it('also lists the JWT placeholders, so the two configs share one rule', () => {
    expect(PUBLICLY_KNOWN_SECRETS.has('your-jwt-secret-key-here-change-in-production')).toBe(true);
    expect(PUBLICLY_KNOWN_SECRETS.has('your-refresh-token-secret-here-change-in-production')).toBe(true);
  });
});

describe('findPubliclyKnownSecret', () => {
  it('ignores every value outside production', () => {
    expect(findPubliclyKnownSecret('development', { ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE })).toBeUndefined();
    expect(findPubliclyKnownSecret('test', { ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE })).toBeUndefined();
    expect(findPubliclyKnownSecret('staging', { ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE })).toBeUndefined();
  });

  it('names the offending variable in production', () => {
    expect(findPubliclyKnownSecret('production', { ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE })).toBe(
      'ENCRYPTION_KEY',
    );
  });

  it('accepts a value the operator chose', () => {
    expect(findPubliclyKnownSecret('production', { ENCRYPTION_KEY: REAL_KEY })).toBeUndefined();
  });
});

describe('buildEncryptionConfig outside production', () => {
  it('accepts the placeholder so local work and the suite need no secret of their own', () => {
    const config = buildEncryptionConfig({ NODE_ENV: 'development', ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE });

    expect(config.key).toBe(PLACEHOLDER_FROM_ENV_EXAMPLE);
  });

  it('accepts the placeholder under test and staging too', () => {
    for (const nodeEnv of ['test', 'staging', 'development']) {
      expect(buildEncryptionConfig({ NODE_ENV: nodeEnv, ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE }).key).toBe(
        PLACEHOLDER_FROM_ENV_EXAMPLE,
      );
    }
  });

  it('accepts a short key, because scrypt stretches it rather than the KDF being skipped', () => {
    expect(buildEncryptionConfig({ ENCRYPTION_KEY: 'short' }).key).toBe('short');
  });

  it('refuses an absent variable', () => {
    expect(() => buildEncryptionConfig({})).toThrow('ENCRYPTION_KEY must be configured');
  });

  it('refuses a blank variable rather than stretching "" into a shared key', () => {
    expect(() => buildEncryptionConfig({ ENCRYPTION_KEY: '' })).toThrow('ENCRYPTION_KEY must be configured');
  });
});

describe('buildEncryptionConfig in production', () => {
  const production = { NODE_ENV: 'production' };

  it('refuses the placeholder that ships in .env.example', () => {
    expect(() => buildEncryptionConfig({ ...production, ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE })).toThrow(
      'ENCRYPTION_KEY is still a publicly known placeholder',
    );
  });

  it('refuses an absent variable rather than falling back to anything', () => {
    expect(() => buildEncryptionConfig(production)).toThrow('ENCRYPTION_KEY must be configured');
  });

  it('starts on a value the operator chose', () => {
    const config = buildEncryptionConfig({ ...production, ENCRYPTION_KEY: REAL_KEY });

    expect(config.key).toBe(REAL_KEY);
  });

  it('names the command that generates an acceptable value', () => {
    expect(() => buildEncryptionConfig({ ...production, ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE })).toThrow(
      'openssl rand -base64 48',
    );
  });

  it('explains itself in one readable line rather than a ZodError JSON dump', () => {
    let message = '';

    try {
      buildEncryptionConfig({ ...production, ENCRYPTION_KEY: PLACEHOLDER_FROM_ENV_EXAMPLE });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Refusing to start with an unsafe encryption configuration');
    expect(message).not.toContain('ZodError');
    expect(message).not.toContain('[{');
  });
});

describe('the shared message', () => {
  it('reports the minimum length that the JWT config also enforces', () => {
    expect(productionSecretError('ENCRYPTION_KEY')).toBe(
      'ENCRYPTION_KEY is still a publicly known placeholder. Set a unique value of at least 32 characters ' +
        'before starting in production (for example: openssl rand -base64 48).',
    );
  });
});
