import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';

import { EncryptionService } from './encryption.util.ts';

const KEY = 'a-very-secret-key-for-encryption-spec';
const OTHER_KEY = 'a-completely-different-secret-key-value';
const IV_BYTES = 16;
const TAG_BYTES = 16;

const ARABIC_TEXT = 'مرحبا بالعالم، هذا نص عربي للاختبار مع علامات ترقيم! ١٢٣';
const EMOJI_TEXT = 'reaction 👻 wow 😱🎉 mixed 🇪🇬';
const LONG_TEXT = 'hakawi-'.repeat(5000);

type DecodedCiphertext = {
  iv: Buffer;
  body: Buffer;
  authTag: Buffer;
};

function buildService(secret: string = KEY): EncryptionService {
  return new EncryptionService(new ConfigService({ ENCRYPTION_KEY: secret }));
}

function buildServiceWithoutKey(): EncryptionService {
  return new EncryptionService(new ConfigService({}));
}

/** Same as `buildService`, but with the production flag the deployment would set. */
function buildServiceInProduction(secret: string = KEY): EncryptionService {
  return new EncryptionService(new ConfigService({ ENCRYPTION_KEY: secret, NODE_ENV: 'production' }));
}

function decode(ciphertext: string): DecodedCiphertext {
  const combined = Buffer.from(ciphertext, 'base64');
  return {
    iv: combined.subarray(0, IV_BYTES),
    body: combined.subarray(IV_BYTES, combined.length - TAG_BYTES),
    authTag: combined.subarray(combined.length - TAG_BYTES),
  };
}

function flipByte(buffer: Buffer, index: number): Buffer {
  const copy = Buffer.from(buffer);
  copy[index] = copy[index] ^ 0xff;
  return copy;
}

function reassemble(parts: DecodedCiphertext): string {
  return Buffer.concat([parts.iv, parts.body, parts.authTag]).toString('base64');
}

describe('EncryptionService', () => {
  describe('round trip', () => {
    it.each([
      { label: 'a short ascii string', plaintext: 'hello world' },
      { label: 'an empty string', plaintext: '' },
      { label: 'a single character', plaintext: 'x' },
      { label: 'arabic text', plaintext: ARABIC_TEXT },
      { label: 'emoji and multi-byte runes', plaintext: EMOJI_TEXT },
      { label: 'text that is exactly one AES block', plaintext: 'a'.repeat(16) },
      { label: 'text that is one byte over an AES block', plaintext: 'b'.repeat(17) },
      { label: 'long input', plaintext: LONG_TEXT },
      { label: 'json-looking content', plaintext: '{"token":"abc.def.ghi","n":1}' },
      { label: 'newlines and tabs', plaintext: 'line1\nline2\tend\r\n' },
    ])('should decrypt $label back to the original plaintext', ({ plaintext }) => {
      const service = buildService();

      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should produce a ciphertext that is not the plaintext', () => {
      const service = buildService();

      const ciphertext = service.encrypt('super secret value');

      expect(ciphertext).not.toBe('super secret value');
      expect(ciphertext).not.toContain('super secret value');
      expect(Buffer.from(ciphertext, 'base64').toString('utf8')).not.toContain('super secret value');
    });

    it('should round trip a value written and read by two service instances sharing one key', () => {
      const writer = buildService();
      const reader = buildService();

      expect(reader.decrypt(writer.encrypt('cross-instance'))).toBe('cross-instance');
    });

    it('should derive a distinct cipher text for the same plaintext under two different keys', () => {
      const first = buildService();
      const second = buildService(OTHER_KEY);

      const a = first.encrypt('identical plaintext');
      const b = second.encrypt('identical plaintext');

      expect(a).not.toBe(b);
      expect(() => second.decrypt(a)).toThrow();
    });
  });

  describe('iv randomness', () => {
    it('should produce a different ciphertext every time the same plaintext is encrypted', () => {
      const service = buildService();
      const plaintext = 'duplicate me';

      const outputs = new Set(Array.from({ length: 25 }, () => service.encrypt(plaintext)));

      expect(outputs.size).toBe(25);
    });

    it('should embed a different initialisation vector in every ciphertext', () => {
      const service = buildService();

      const ivs = new Set(Array.from({ length: 25 }, () => decode(service.encrypt('same input')).iv.toString('hex')));

      expect(ivs.size).toBe(25);
    });

    it('should still decrypt every ciphertext produced from the same plaintext', () => {
      const service = buildService();
      const plaintext = ARABIC_TEXT;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
      }
    });

    it('should lay the payload out as iv + ciphertext + auth tag', () => {
      const service = buildService();
      const plaintext = 'layout check';

      const ciphertext = service.encrypt(plaintext);
      const combined = Buffer.from(ciphertext, 'base64');
      const parts = decode(ciphertext);

      expect(combined.length).toBe(IV_BYTES + Buffer.byteLength(plaintext, 'utf8') + TAG_BYTES);
      expect(parts.iv.length).toBe(IV_BYTES);
      expect(parts.authTag.length).toBe(TAG_BYTES);
      expect(parts.body.toString('utf8')).not.toBe(plaintext);
    });
  });

  describe('integrity', () => {
    it('should detect a flipped byte inside the auth tag', () => {
      const service = buildService();
      const ciphertext = service.encrypt('integrity check');
      const parts = decode(ciphertext);

      const tampered = reassemble({ ...parts, authTag: flipByte(parts.authTag, 0) });

      expect(() => service.decrypt(tampered)).toThrow();
      expect(() => service.decrypt(tampered)).toThrow('Unsupported state or unable to authenticate data');
    });

    it.each([0, 5, 15])('should detect a flipped byte at auth tag offset %i', (index) => {
      const service = buildService();
      const parts = decode(service.encrypt('tag byte sweep'));

      const tampered = reassemble({ ...parts, authTag: flipByte(parts.authTag, index) });

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect a flipped byte in the initialisation vector', () => {
      const service = buildService();
      const parts = decode(service.encrypt('iv tamper'));

      const tampered = reassemble({ ...parts, iv: flipByte(parts.iv, 3) });

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect a flipped byte in the ciphertext body', () => {
      const service = buildService();
      const parts = decode(service.encrypt('body tamper that is long enough to have bytes'));

      const tampered = reassemble({ ...parts, body: flipByte(parts.body, 4) });

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect a body that has been swapped for another message body', () => {
      const service = buildService();
      const victim = decode(service.encrypt('victim message body here'));
      const attacker = decode(service.encrypt('attacker message body here'));

      const spliced = reassemble({ iv: victim.iv, body: attacker.body, authTag: victim.authTag });

      expect(() => service.decrypt(spliced)).toThrow();
    });

    it('should detect a ciphertext whose body was truncated by one byte', () => {
      const service = buildService();
      const parts = decode(service.encrypt('truncation probe text'));

      const truncated = reassemble({
        iv: parts.iv,
        body: parts.body.subarray(0, parts.body.length - 1),
        authTag: parts.authTag,
      });

      expect(() => service.decrypt(truncated)).toThrow();
    });

    it('should detect a ciphertext with bytes appended after the auth tag', () => {
      const service = buildService();
      const appended = Buffer.concat([
        Buffer.from(service.encrypt('append probe'), 'base64'),
        Buffer.from([0x00]),
      ]).toString('base64');

      expect(() => service.decrypt(appended)).toThrow();
    });
  });

  describe('wrong key', () => {
    it('should throw when the ciphertext is decrypted with a different key', () => {
      const writer = buildService();
      const attacker = buildService(OTHER_KEY);

      expect(() => attacker.decrypt(writer.encrypt('secret payload'))).toThrow(
        'Unsupported state or unable to authenticate data',
      );
    });

    it('should throw for a single-bit key difference', () => {
      const writer = buildService();
      const nearMiss = buildService(`${KEY}x`);

      expect(() => nearMiss.decrypt(writer.encrypt('secret payload'))).toThrow();
    });
  });

  describe('malformed payloads', () => {
    it.each([
      { label: 'an empty string', value: '' },
      { label: 'a short base64 string', value: 'YWJj' },
      { label: 'a bare iv with no body and no tag', value: Buffer.alloc(IV_BYTES, 7).toString('base64') },
      { label: 'a non-base64 string', value: 'this is not base64 at all !!!' },
      {
        label: 'an iv plus a tag with no body',
        value: Buffer.concat([Buffer.alloc(IV_BYTES, 1), Buffer.alloc(TAG_BYTES, 2)]).toString('base64'),
      },
    ])('should throw instead of returning garbage for $label', ({ value }) => {
      const service = buildService();

      expect(() => service.decrypt(value)).toThrow();
    });

    it('should throw when handed the plaintext instead of a ciphertext', () => {
      const service = buildService();

      expect(() => service.decrypt('a plain unencrypted message body')).toThrow();
    });

    it('should throw for a base64 payload of the right length filled with zeros', () => {
      const service = buildService();

      expect(() => service.decrypt(Buffer.alloc(IV_BYTES + TAG_BYTES + 32, 0).toString('base64'))).toThrow();
    });
  });

  describe('construction', () => {
    it('should throw when ENCRYPTION_KEY is absent from configuration', () => {
      expect(() => buildServiceWithoutKey()).toThrow('ENCRYPTION_KEY must be configured');
    });

    it('should throw when ENCRYPTION_KEY is an empty string', () => {
      expect(() => buildService('')).toThrow('ENCRYPTION_KEY must be configured');
    });

    it('should accept a short key by stretching it rather than rejecting it', () => {
      const service = buildService('short');

      expect(service.decrypt(service.encrypt('stretched key works'))).toBe('stretched key works');
    });
  });

  /**
   * The service is constructed once, at boot, so a refusal here is the only chance to stop a
   * deployment that copied `.env.example` verbatim from ever minting a reset token anybody can read.
   */
  describe('construction in production', () => {
    it('should refuse the placeholder that ships in .env.example', () => {
      expect(() => buildServiceInProduction('your-encryption-key-here-change-in-production')).toThrow(
        'ENCRYPTION_KEY is still a publicly known placeholder',
      );
    });

    it('should refuse an absent key rather than deriving one from anything', () => {
      expect(() => new EncryptionService(new ConfigService({ NODE_ENV: 'production' }))).toThrow(
        'ENCRYPTION_KEY must be configured',
      );
    });

    it('should build on a value the operator chose', () => {
      const service = buildServiceInProduction();

      expect(service.decrypt(service.encrypt('production round trip'))).toBe('production round trip');
    });
  });
});
