import { createHmac } from 'node:crypto';

/**
 * A TOTP CODE, FOR A TEST THAT NEEDS ONE.
 *
 * THE SERVER NEVER GENERATES CODES. That is the whole point of a second factor: the
 * code comes from the reader's authenticator app, and the server only VERIFIES it. So a
 * test that has to present one has to produce it, and the only honest way to do that is
 * to produce the same code the app would — which is what this does.
 *
 * IT IS THE STANDARD ALGORITHM, NOT A SHORTCUT. RFC 6238: an HMAC-SHA1 over the
 * counter, truncated to thirty-one bits, modulo a million. The `speakeasy` package
 * installed in the backend can VERIFY a code but cannot produce one, so the arithmetic
 * is written out here rather than worked around.
 *
 * IT IS CHECKED AGAINST THE LIBRARY. `mfa.service.spec.ts` asserts that a code from
 * here is accepted by the service's own verifier, so the two implementations cannot
 * drift apart unnoticed: a change in either one that broke the agreement would fail
 * the suite.
 */

/** The base32 alphabet, without the padding. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The length of a TOTP step, in seconds. */
const TOTP_PERIOD_SECONDS = 30;

/** The number of digits a code has. */
const TOTP_DIGITS = 6;

/**
 * Decode a base32 secret into the bytes the HMAC is computed over.
 */
function decodeBase32(encoded: string): Buffer {
  const normalised = encoded.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = '';
  for (const character of normalised) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * The code for a secret, at a moment in time.
 *
 * @param secret the base32 secret the setup endpoint returned.
 * @param at the moment the code is for; the present by default.
 */
export function totpCode(secret: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}
