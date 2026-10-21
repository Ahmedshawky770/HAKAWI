import { describe, it, expect } from 'vitest';
import * as speakeasy from 'speakeasy';

import { totpCode } from './totp.ts';

/**
 * A BASE32 SECRET, FROM THE LIBRARY.
 *
 * `generateSecret` returns an object holding the secret in every encoding at runtime,
 * while its type says it returns a string — so the value is read off the object and
 * the difference is stated once, here, instead of in every case.
 */
const base32Secret = (): string => speakeasy.generateSecret({ length: 20 }).base32;

/**
 * THE TEST'S CODE GENERATOR, AGAINST THE LIBRARY THE SERVICE USES.
 *
 * The backend installs `speakeasy`, which can VERIFY a code but cannot produce one — so
 * the test writes the arithmetic out. If the two ever disagree, a test that presents a
 * code would be refused for a reason that has nothing to do with what is being tested.
 * So they are compared here, on real secrets, at a real moment.
 */
describe('the test TOTP generator', () => {
  it('produces a code the service verifier accepts', () => {
    const secret = base32Secret();
    const code = totpCode(secret);

    expect(code).toMatch(/^\d{6}$/);
    expect(
      speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 }),
    ).toBe(true);
  });

  it('produces a different code for a different secret', () => {
    const first = base32Secret();
    const second = base32Secret();

    expect(totpCode(first)).not.toBe(totpCode(second));
  });

  it('produces a different code for the next step, as the counter moves', () => {
    // A TOTP code is good for thirty seconds and for no longer, so a code for the
    // next step is a different code. A test that presented a stale code would be
    // testing the clock rather than the flow.
    const secret = base32Secret();
    const moment = new Date('2026-05-01T00:15:00.000Z');

    expect(totpCode(secret, moment)).not.toBe(totpCode(secret, new Date(moment.getTime() + 30_000)));
  });
});
