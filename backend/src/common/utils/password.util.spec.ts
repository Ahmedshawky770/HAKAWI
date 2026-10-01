import { describe, it, expect } from 'vitest';

import { PasswordHasher } from './password.util.ts';

/**
 * Every test here performs REAL bcrypt work at the production cost factor. 12 rounds is
 * roughly a quarter second of CPU on an idle machine, and the suite runs these in parallel
 * across workers, so the default 5s budget is occasionally not enough.
 *
 * The budget is stated per test rather than raised globally. A global raise would also mask
 * a genuine hang in a test that should complete in milliseconds, and would make a real
 * regression slower to notice.
 */
const BCRYPT_TIMEOUT_MS = 30_000;

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it(
    'produces a hash that is not the plaintext',
    async () => {
      const hash = await hasher.hash('correct horse battery staple');

      expect(hash).not.toBe('correct horse battery staple');
      expect(hash).not.toContain('correct horse');
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'accepts the original password against its own hash',
    async () => {
      const hash = await hasher.hash('correct horse battery staple');

      await expect(hasher.compare('correct horse battery staple', hash)).resolves.toBe(true);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'rejects a different password against that hash',
    async () => {
      const hash = await hasher.hash('correct horse battery staple');

      // A false rather than a throw: a wrong password is an authentication failure, and the
      // caller must be able to distinguish it from the store being unavailable.
      await expect(hasher.compare('correct horse battery stapler', hash)).resolves.toBe(false);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'salts, so the same password hashes differently each time',
    async () => {
      // Without a per-hash salt, two users with the same password would be visibly identical
      // in the database, and one precomputed table would crack every account at once.
      const [first, second] = await Promise.all([hasher.hash('same-password'), hasher.hash('same-password')]);

      expect(first).not.toBe(second);
      await expect(hasher.compare('same-password', first)).resolves.toBe(true);
      await expect(hasher.compare('same-password', second)).resolves.toBe(true);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'hashes with 12 rounds, the cost the platform declares',
    async () => {
      const hash = await hasher.hash('cost-check');

      // Read the cost out of the hash rather than spying on bcrypt. bcrypt encodes it as the
      // third field of the modular-crypt string, so this asserts the real work factor with no
      // module spy (impossible on an ESM namespace) and no timing measurement (slow and
      // flaky). If someone lowers `rounds` for speed, this fails.
      expect(hash.split('$')[2]).toBe('12');
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('rejects an empty or whitespace-only password without hashing it', async () => {
    // bcrypt accepts an empty string and returns a valid-looking hash, so the guard has to
    // live above bcrypt. The API already blocks this with @MinLength(8); this is the guard
    // against the next caller that does not.
    await expect(hasher.hash('')).rejects.toThrow(/must not be empty/);
    await expect(hasher.hash('   ')).rejects.toThrow(/must not be empty/);
    await expect(hasher.hash('\t\n')).rejects.toThrow(/must not be empty/);
  });

  it('compares false rather than throwing when asked about an empty password', async () => {
    // A wrong password is an authentication failure; the caller must be able to tell that
    // apart from the store being unavailable, so this returns false instead of raising.
    await expect(hasher.compare('', '$2b$12$abcdefghijklmnopqrstuv')).resolves.toBe(false);
    await expect(hasher.compare('some-password', '')).resolves.toBe(false);
  });
});
