import crypto from 'crypto';

import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildEncryptionConfig } from '../../config/encryption.config.ts';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * WHY A CONSTANT, PUBLIC SALT IS CORRECT HERE — AND WHY THIS IS NOT A SECRET.
 *
 * A KDF salt exists to defeat *precomputation*: an attacker who wants to test many candidate
 * secrets must pay the full scrypt cost for each distinct (secret, salt) pair instead of paying it
 * once and reusing the table. That defence is worth its cost when the input is a low-entropy human
 * password reused across many targets at once. It is worth nothing when the input is
 * `ENCRYPTION_KEY`:
 *
 *  - The attacker must already hold ciphertexts, which means they already hold the key in practice;
 *    the salt never entered that picture.
 *  - The salt is in this repository, so an attacker guessing `ENCRYPTION_KEY` simply calls
 *    `scryptSync(candidate, 'hakawi-encryption-salt', 32)` themselves. It raises their per-guess
 *    cost by exactly the factor scrypt already imposes.
 *  - `ENCRYPTION_KEY` is a generated high-entropy secret, not a password. There is no dictionary to
 *    amortise across.
 *
 * What the constant salt *does* buy is key-domain separation: the same secret string stretched here
 * yields a different AES key than it would in any other derivation, so key material is not shared
 * between purposes.
 *
 * WHY MAKING IT CONFIGURABLE WOULD BE A BREAKING CHANGE, NOT AN IMPROVEMENT: the salt is not stored
 * in the ciphertext — the wire format is `iv | body | authTag` — so there is nowhere to read the
 * salt back from. Rotating it would make every existing password-reset token and every stored
 * ciphertext undecryptable with no way to migrate them, because the salt that produced them would
 * be unrecoverable. That is a data-loss migration (Principle #6) to buy nothing, so the constant
 * stays and the reasoning is recorded here instead (Principle #4).
 *
 * WHAT ACTUALLY PROTECTS THE CIPHERTEXTS: the per-message random IV. `encrypt()` draws a fresh IV
 * for every call, so encrypting the same plaintext twice under one key yields two different
 * ciphertexts. The salt is not a nonce and its reuse is not a GCM nonce reuse.
 */
const KEY_DERIVATION_SALT = 'hakawi-encryption-salt';

@Injectable()
export class EncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    // WHY the values are handed to the validator as a plain object rather than `process.env`: this
    // service is constructed from an injected `ConfigService`, which in the unit suite carries only
    // what a test set. Reading `process.env` here would ignore that and make the service untestable.
    // The rules themselves live in `encryption.config.ts` so `ENCRYPTION_KEY` cannot disagree with
    // `JWT_SECRET` about which values are public (Principle #9).
    const { key } = buildEncryptionConfig({
      ENCRYPTION_KEY: this.configService.get<string>('ENCRYPTION_KEY'),
      NODE_ENV: this.configService.get<string>('NODE_ENV'),
    });

    this.encryptionKey = crypto.scryptSync(key, KEY_DERIVATION_SALT, KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, encrypted, authTag]);
    return combined.toString('base64');
  }

  decrypt(ciphertext: string): string {
    const combined = Buffer.from(ciphertext, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
