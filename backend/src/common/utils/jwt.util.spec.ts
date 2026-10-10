import { createHmac, createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { decode as decodeJwt, JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import type { StringValue } from 'ms';

import { JwtHelper, AppleJwksService, fingerprintToken, type JwtPayload } from './jwt.util.ts';

const ACCESS_SECRET = 'access-secret-for-jwt-util-spec-0123456789abcdef';
const REFRESH_SECRET = 'refresh-secret-for-jwt-util-spec-fedcba9876543210';

type JwtConfig = {
  secret: string;
  expiry: string;
  refreshSecret: string;
  refreshExpiry: string;
};

type DecodedClaims = {
  sub: string;
  email: string;
  accountType: string;
  adminRole?: string;
  type?: string;
  iat: number;
  exp: number;
};

const ADMIN_PAYLOAD: JwtPayload = {
  sub: 'admin-1',
  email: 'admin@hakawi.com',
  accountType: 'admin',
  adminRole: 'super_admin',
};

const READER_PAYLOAD: JwtPayload = {
  sub: 'user-1',
  email: 'reader@hakawi.com',
  accountType: 'reader',
};

function buildConfig(overrides: Partial<JwtConfig> = {}): JwtConfig {
  return {
    secret: ACCESS_SECRET,
    expiry: '15m',
    refreshSecret: REFRESH_SECRET,
    refreshExpiry: '7d',
    ...overrides,
  };
}

function buildHelper(overrides: Partial<JwtConfig> = {}): JwtHelper {
  const config = buildConfig(overrides);
  return new JwtHelper(new JwtService({ secret: config.secret }), new ConfigService({ jwt: config }));
}

function claims(token: string): DecodedClaims {
  const decoded = decodeJwt(token);
  if (decoded === null || typeof decoded === 'string') {
    throw new Error('token did not decode to an object');
  }
  return decoded as DecodedClaims;
}

function tamper(token: string, mutate: (payload: DecodedClaims) => void): string {
  const segments = token.split('.');
  const payloadSegment = segments[1];
  const signatureSegment = segments[2];
  if (payloadSegment === undefined || signatureSegment === undefined) {
    throw new Error('token is not a three-segment JWT');
  }
  const decoded = decodeJwt(token);
  if (decoded === null || typeof decoded === 'string') {
    throw new Error('token did not decode to an object');
  }
  const payload: DecodedClaims = { ...(decoded as DecodedClaims) };
  mutate(payload);
  const forgedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${segments[0]}.${forgedPayload}.${signatureSegment}`;
}

describe('JwtHelper', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('generateAccessToken', () => {
    it('should produce a token that verifyAccessToken resolves back to the admin claims', () => {
      const helper = buildHelper();

      const token = helper.generateAccessToken(ADMIN_PAYLOAD);
      const verified = helper.verifyAccessToken(token);

      expect(verified.sub).toBe('admin-1');
      expect(verified.email).toBe('admin@hakawi.com');
      expect(verified.accountType).toBe('admin');
      expect(verified.adminRole).toBe('super_admin');
    });

    it('should not invent an adminRole claim for a reader token', () => {
      const helper = buildHelper();

      const verified = helper.verifyAccessToken(helper.generateAccessToken(READER_PAYLOAD));

      expect(verified.sub).toBe('user-1');
      expect(verified.accountType).toBe('reader');
      expect(verified.adminRole).toBeUndefined();
      expect(claims(helper.generateAccessToken(READER_PAYLOAD))).not.toHaveProperty('adminRole');
    });

    it('should not include the refresh type claim on an access token', () => {
      const helper = buildHelper();

      expect(claims(helper.generateAccessToken(ADMIN_PAYLOAD)).type).toBeUndefined();
    });

    it('should not mutate the payload object it was handed', () => {
      const helper = buildHelper();
      const payload: JwtPayload = { ...ADMIN_PAYLOAD };

      helper.generateAccessToken(payload);
      helper.generateRefreshToken(payload);

      expect(Object.keys(payload).sort()).toEqual(['accountType', 'adminRole', 'email', 'sub']);
    });

    it('should honour the configured access expiry of 15 minutes', () => {
      const helper = buildHelper();

      const decoded = claims(helper.generateAccessToken(READER_PAYLOAD));

      expect(decoded.exp - decoded.iat).toBe(900);
    });

    it.each([
      { expiry: '30s', expectedSeconds: 30 },
      { expiry: '2h', expectedSeconds: 7200 },
      { expiry: '1d', expectedSeconds: 86400 },
    ])('should honour the configured access expiry $expiry', ({ expiry, expectedSeconds }) => {
      const helper = buildHelper({ expiry });

      const decoded = claims(helper.generateAccessToken(READER_PAYLOAD));

      expect(decoded.exp - decoded.iat).toBe(expectedSeconds);
    });
  });

  describe('generateRefreshToken', () => {
    it('should produce a token that verifyRefreshToken resolves to type refresh', () => {
      const helper = buildHelper();

      const token = helper.generateRefreshToken(ADMIN_PAYLOAD);
      const verified = helper.verifyRefreshToken(token);

      expect(verified.type).toBe('refresh');
      expect(verified.sub).toBe('admin-1');
      expect(verified.email).toBe('admin@hakawi.com');
      expect(verified.accountType).toBe('admin');
      expect(verified.adminRole).toBe('super_admin');
    });

    it('should honour the configured refresh expiry of 7 days', () => {
      const helper = buildHelper();

      const decoded = claims(helper.generateRefreshToken(READER_PAYLOAD));

      expect(decoded.exp - decoded.iat).toBe(604800);
    });

    it('should honour a reconfigured refresh expiry of 12 hours', () => {
      const helper = buildHelper({ refreshExpiry: '12h' });

      const decoded = claims(helper.generateRefreshToken(READER_PAYLOAD));

      expect(decoded.exp - decoded.iat).toBe(43200);
    });
  });

  describe('cross-token rejection', () => {
    it('should reject a refresh token presented as an access token', () => {
      const helper = buildHelper();
      const refreshToken = helper.generateRefreshToken(ADMIN_PAYLOAD);

      expect(() => helper.verifyAccessToken(refreshToken)).toThrow(JsonWebTokenError);
      expect(() => helper.verifyAccessToken(refreshToken)).toThrow('invalid signature');
    });

    it('should reject an access token presented as a refresh token', () => {
      const helper = buildHelper();
      const accessToken = helper.generateAccessToken(ADMIN_PAYLOAD);

      expect(() => helper.verifyRefreshToken(accessToken)).toThrow(JsonWebTokenError);
      expect(() => helper.verifyRefreshToken(accessToken)).toThrow('invalid signature');
    });

    it('should reject a token minted with the refresh secret but shaped like an access token', () => {
      const helper = buildHelper();
      const attacker = new JwtService({ secret: ACCESS_SECRET });
      const forged = attacker.sign({ ...ADMIN_PAYLOAD }, { secret: REFRESH_SECRET as StringValue });

      expect(() => helper.verifyAccessToken(forged)).toThrow('invalid signature');
    });

    it('should reject a token minted with the access secret but carrying the refresh type claim', () => {
      const helper = buildHelper();
      const attacker = new JwtService({ secret: ACCESS_SECRET });
      const forged = attacker.sign({ ...ADMIN_PAYLOAD, type: 'refresh' }, { secret: ACCESS_SECRET as StringValue });

      expect(() => helper.verifyRefreshToken(forged)).toThrow('invalid signature');
    });

    it('should reject a token signed by a different deployment secret', () => {
      const helper = buildHelper();
      const foreign = new JwtService({ secret: 'some-other-deployment-secret-entirely-xyz' });
      const foreignToken = foreign.sign({ ...ADMIN_PAYLOAD }, { secret: 'another-secret-not-in-config' });

      expect(() => helper.verifyAccessToken(foreignToken)).toThrow('invalid signature');
      expect(() => helper.verifyRefreshToken(foreignToken)).toThrow('invalid signature');
    });

    it('should still accept its own tokens after refusing a foreign secret', () => {
      const helper = buildHelper();
      const token = helper.generateAccessToken(ADMIN_PAYLOAD);
      const foreign = new JwtService({ secret: 'some-other-deployment-secret-entirely-xyz' });
      const foreignToken = foreign.sign({ ...ADMIN_PAYLOAD }, { secret: 'another-secret-not-in-config' });

      expect(() => helper.verifyAccessToken(foreignToken)).toThrow();
      expect(helper.verifyAccessToken(token).sub).toBe('admin-1');
    });
  });

  describe('tampering', () => {
    it('should reject an access token whose adminRole was escalated without re-signing', () => {
      const helper = buildHelper();
      const readerToken = helper.generateAccessToken(READER_PAYLOAD);

      const escalated = tamper(readerToken, (payload) => {
        payload.adminRole = 'super_admin';
        payload.accountType = 'admin';
      });

      expect(() => helper.verifyAccessToken(escalated)).toThrow('invalid signature');
    });

    it('should reject an access token whose sub was swapped to another user without re-signing', () => {
      const helper = buildHelper();
      const token = helper.generateAccessToken(READER_PAYLOAD);

      const swapped = tamper(token, (payload) => {
        payload.sub = 'user-2';
      });

      expect(() => helper.verifyAccessToken(swapped)).toThrow('invalid signature');
    });

    it('should reject a refresh token whose type claim was downgraded without re-signing', () => {
      const helper = buildHelper();
      const token = helper.generateRefreshToken(ADMIN_PAYLOAD);

      const downgraded = tamper(token, (payload) => {
        delete payload.type;
      });

      expect(() => helper.verifyRefreshToken(downgraded)).toThrow('invalid signature');
    });

    it('should reject an unsigned alg:none token', () => {
      const helper = buildHelper();
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64url');
      const payload = Buffer.from(JSON.stringify({ ...ADMIN_PAYLOAD, iat: 1, exp: 9999999999 }), 'utf8').toString(
        'base64url',
      );

      expect(() => helper.verifyAccessToken(`${header}.${payload}.`)).toThrow(JsonWebTokenError);
    });
  });

  describe('expiry enforcement', () => {
    it('should throw TokenExpiredError once the configured access expiry has passed', () => {
      vi.useFakeTimers();
      const helper = buildHelper({ expiry: '1s' });
      const token = helper.generateAccessToken(ADMIN_PAYLOAD);

      expect(helper.verifyAccessToken(token).sub).toBe('admin-1');

      vi.advanceTimersByTime(2000);

      expect(() => helper.verifyAccessToken(token)).toThrow(TokenExpiredError);
      expect(() => helper.verifyAccessToken(token)).toThrow('jwt expired');
    });

    it('should throw TokenExpiredError once the configured refresh expiry has passed', () => {
      vi.useFakeTimers();
      const helper = buildHelper({ refreshExpiry: '1s' });
      const token = helper.generateRefreshToken(ADMIN_PAYLOAD);

      vi.advanceTimersByTime(5000);

      expect(() => helper.verifyRefreshToken(token)).toThrow(TokenExpiredError);
    });

    it('should keep a token valid for the whole configured window', () => {
      vi.useFakeTimers();
      const helper = buildHelper({ expiry: '1h' });
      const token = helper.generateAccessToken(ADMIN_PAYLOAD);

      vi.advanceTimersByTime(59 * 60 * 1000);

      expect(helper.verifyAccessToken(token).adminRole).toBe('super_admin');
    });
  });

  describe('malformed input', () => {
    // WHY these are asserted on the error type: jsonwebtoken throws a bare TypeError for a
    // missing token, which any caller that skipped its own check turns into a 500. The guard is
    // here so "no credential" is an authentication failure at the one place verification happens.
    it.each([
      { label: 'an empty string', token: '' },
      { label: 'a whitespace-only string', token: '   ' },
      { label: 'a tab and newline', token: '\t\n' },
    ])('rejects $label as an authentication failure rather than a type error', ({ token }) => {
      const helper = buildHelper();

      expect(() => helper.verifyAccessToken(token)).toThrow(UnauthorizedException);
      expect(() => helper.verifyAccessToken(token)).toThrow('Invalid access');
      expect(() => helper.verifyRefreshToken(token)).toThrow(UnauthorizedException);
      expect(() => helper.verifyRefreshToken(token)).toThrow('Invalid refresh');
    });

    it('rejects a missing token without leaking a jsonwebtoken type error', () => {
      const helper = buildHelper();
      const missing = undefined as unknown as string;

      expect(() => helper.verifyAccessToken(missing)).toThrow(UnauthorizedException);
      expect(() => helper.verifyRefreshToken(missing)).toThrow(UnauthorizedException);
    });

    it.each([
      { label: 'a non-JWT string', token: 'this-is-not-a-jwt' },
      { label: 'a two-segment string', token: 'header.payload' },
      { label: 'a base64 blob with no segments', token: 'eyJzdWIiOiIxMjMifQ==' },
      { label: 'a truncated token', token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEifQ' },
    ])('should throw on $label', ({ token }) => {
      const helper = buildHelper();

      expect(() => helper.verifyAccessToken(token)).toThrow();
      expect(() => helper.verifyRefreshToken(token)).toThrow();
    });

    it('should throw for a structurally valid token whose signature is garbage', () => {
      const helper = buildHelper();
      const valid = helper.generateAccessToken(ADMIN_PAYLOAD);
      const segments = valid.split('.');

      const broken = `${segments[0]}.${segments[1]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

      expect(() => helper.verifyAccessToken(broken)).toThrow('invalid signature');
    });

    it('should throw for a token whose header segment is not base64url JSON', () => {
      const helper = buildHelper();
      const valid = helper.generateAccessToken(ADMIN_PAYLOAD);
      const segments = valid.split('.');

      const broken = `!!!not-base64!!!.${segments[1]}.${segments[2]}`;

      expect(() => helper.verifyAccessToken(broken)).toThrow();
    });
  });

  describe('configuration wiring', () => {
    it('should read the access secret from jwt.secret and not from jwt.refreshSecret', () => {
      const helper = buildHelper({ secret: 'access-only-secret-value-here', refreshSecret: REFRESH_SECRET });
      const token = helper.generateAccessToken(ADMIN_PAYLOAD);

      expect(helper.verifyAccessToken(token).sub).toBe('admin-1');
      expect(() => helper.verifyRefreshToken(token)).toThrow('invalid signature');
    });

    it('should read the refresh secret from jwt.refreshSecret and not from jwt.secret', () => {
      const helper = buildHelper({ secret: ACCESS_SECRET, refreshSecret: 'refresh-only-secret-value-here' });
      const token = helper.generateRefreshToken(ADMIN_PAYLOAD);

      expect(helper.verifyRefreshToken(token).type).toBe('refresh');
      expect(() => helper.verifyAccessToken(token)).toThrow('invalid signature');
    });

    it('should fall back to 15m and 7d when no expiry is configured', () => {
      const helper = new JwtHelper(
        new JwtService({ secret: ACCESS_SECRET }),
        new ConfigService({ jwt: { secret: ACCESS_SECRET, refreshSecret: REFRESH_SECRET } }),
      );

      const access = claims(helper.generateAccessToken(READER_PAYLOAD));
      const refresh = claims(helper.generateRefreshToken(READER_PAYLOAD));

      expect(access.exp - access.iat).toBe(900);
      expect(refresh.exp - refresh.iat).toBe(604800);
    });
  });
});

describe('Apple id_token verification', () => {
  // A real RSA key pair so the signature path is genuinely exercised. Generating it per-suite
  // costs ~100ms once and removes any chance of the test passing because a stub returned true.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const KID = 'apple-test-key-1';
  const CLIENT_ID = 'com.hakawi.web';

  function signAppleToken(overrides: Record<string, unknown> = {}, alg: 'RS256' | 'HS256' = 'RS256'): string {
    const header = Buffer.from(JSON.stringify(alg === 'RS256' ? { alg, kid: KID, typ: 'JWT' } : { alg })).toString(
      'base64url',
    );
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        iss: 'https://appleid.apple.com',
        aud: CLIENT_ID,
        sub: 'apple-subject-1',
        email: 'reader@hakawi.com',
        email_verified: true,
        iat: now,
        exp: now + 3600,
        ...overrides,
      }),
    ).toString('base64url');
    const signingInput = `${header}.${body}`;
    const signature =
      alg === 'RS256'
        ? createSign('RSA-SHA256').update(signingInput).sign(privateKey).toString('base64url')
        : createHmac('sha256', ACCESS_SECRET).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
  }

  function buildAppleHelper(clientId = CLIENT_ID): JwtHelper {
    return new JwtHelper(
      new JwtService({ secret: ACCESS_SECRET }),
      new ConfigService({ jwt: { secret: ACCESS_SECRET, refreshSecret: REFRESH_SECRET }, apple: { clientId } }),
    );
  }

  function buildJwks(): AppleJwksService {
    const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
    return {
      resolveKey: vi.fn().mockResolvedValue(createPublicKey({ key: { kty: 'RSA', ...jwk }, format: 'jwk' })),
    } as unknown as AppleJwksService;
  }

  it('accepts a token Apple actually signed, and returns the subject and email', async () => {
    const claims = await buildAppleHelper().verifyAppleIdToken(signAppleToken(), buildJwks());

    expect(claims.sub).toBe('apple-subject-1');
    expect(claims.email).toBe('reader@hakawi.com');
    expect(claims.emailVerified).toBe(true);
  });

  it("rejects a token signed with this application's own HS256 secret", async () => {
    // The original bug: `verifyAccessToken(id_token)` checked the Apple token against our own
    // HMAC secret. A token we minted ourselves satisfies that — and any token minted for any
    // subject would have satisfied it too.
    const helper = buildAppleHelper();
    const hs256Token = signAppleToken({}, 'HS256');

    await expect(helper.verifyAppleIdToken(hs256Token, buildJwks())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token whose iss is not Apple', async () => {
    const helper = buildAppleHelper();
    await expect(helper.verifyAppleIdToken(signAppleToken({ iss: 'https://evil.test' }), buildJwks())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token minted for a different Apple application', async () => {
    // Without the aud check, a token Apple issued for any other app in any other developer
    // account would authenticate a user here.
    const helper = buildAppleHelper();
    await expect(helper.verifyAppleIdToken(signAppleToken({ aud: 'com.someone.else' }), buildJwks())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts aud as an array containing this application', async () => {
    const helper = buildAppleHelper();
    const claims = await helper.verifyAppleIdToken(
      signAppleToken({ aud: ['com.someone.else', CLIENT_ID] }),
      buildJwks(),
    );
    expect(claims.sub).toBe('apple-subject-1');
  });

  it('rejects an expired token', async () => {
    const helper = buildAppleHelper();
    const now = Math.floor(Date.now() / 1000);
    await expect(helper.verifyAppleIdToken(signAppleToken({ exp: now - 60 }), buildJwks())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed by a key id we do not have', async () => {
    const helper = buildAppleHelper();
    const jwks = { resolveKey: vi.fn().mockResolvedValue(null) } as unknown as AppleJwksService;
    await expect(helper.verifyAppleIdToken(signAppleToken(), jwks)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token with no subject', async () => {
    const helper = buildAppleHelper();
    await expect(helper.verifyAppleIdToken(signAppleToken({ sub: '' }), buildJwks())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a structurally malformed token', async () => {
    const helper = buildAppleHelper();
    await expect(helper.verifyAppleIdToken('not.a.jwt', buildJwks())).rejects.toThrow(UnauthorizedException);
    await expect(helper.verifyAppleIdToken('   ', buildJwks())).rejects.toThrow(UnauthorizedException);
  });

  it('refuses every audience when no client id is configured, rather than accepting any', async () => {
    const helper = buildAppleHelper('');
    await expect(helper.verifyAppleIdToken(signAppleToken(), buildJwks())).rejects.toThrow(UnauthorizedException);
  });
});

describe('fingerprintToken', () => {
  it('is stable, so a blacklist lookup still matches', () => {
    expect(fingerprintToken('abc')).toBe(fingerprintToken('abc'));
  });

  it('does not contain the token it was derived from', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.super-secret-refresh-token.signature';
    expect(fingerprintToken(token)).not.toContain('super-secret-refresh-token');
  });

  it('separates two different tokens', () => {
    expect(fingerprintToken('token-a')).not.toBe(fingerprintToken('token-b'));
  });
});
