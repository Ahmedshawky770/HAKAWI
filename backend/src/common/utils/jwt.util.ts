import { createHash, createPublicKey, createVerify, type KeyObject } from 'node:crypto';

import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

export interface JwtPayload {
  sub: string;
  email: string;
  accountType: string;
  adminRole?: string;
}

/**
 * The only signing algorithm this application accepts.
 *
 * Both secrets are HMAC, so the practical risk today is low — `alg: none` is not in
 * jsonwebtoken's default allow-list, and an RS/HS confusion attack needs a public key that
 * doubles as the HMAC secret. Pinning the algorithm makes that impossible by construction
 * rather than by accident, so a future move to asymmetric keys cannot silently widen the
 * contract: whoever makes that change has to come here and change this line, which is the
 * point (Principle #15: the boundary is where the mistake is caught).
 */
const HS256 = 'HS256';

const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_TTL_MS = 6 * 60 * 60 * 1000;

export interface AppleIdTokenClaims {
  readonly sub: string;
  readonly email?: string;
  readonly iss: string;
  readonly aud: string;
}

/**
 * Apple's public signing keys, cached in-process.
 *
 * Apple rotates its signing keys, so they cannot be pinned in configuration. They are fetched
 * once and reused for six hours, which is far below Apple's rotation period but well above the
 * rate at which a login flow would otherwise refetch them.
 */
@Injectable()
export class AppleJwksService {
  private cache: { readonly keys: ReadonlyMap<string, KeyObject>; readonly fetchedAtMs: number } | null = null;

  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async resolveKey(kid: string): Promise<KeyObject | null> {
    const keys = await this.keys();
    return keys.get(kid) ?? null;
  }

  private async keys(): Promise<ReadonlyMap<string, KeyObject>> {
    const now = Date.now();
    if (this.cache !== null && now - this.cache.fetchedAtMs < APPLE_JWKS_TTL_MS) {
      return this.cache.keys;
    }

    const response = await fetch(APPLE_JWKS_URI, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new Error(`Apple JWKS fetch failed with status ${response.status}`);
    }
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !Array.isArray((body as { keys?: unknown }).keys)) {
      throw new Error('Apple JWKS response did not contain a keys array');
    }

    const keys = new Map<string, KeyObject>();
    for (const entry of (body as { keys: unknown[] }).keys) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const { kid, kty, n, e, alg } = entry as {
        kid?: unknown;
        kty?: unknown;
        n?: unknown;
        e?: unknown;
        alg?: unknown;
      };
      if (typeof kid !== 'string' || kty !== 'RSA' || typeof n !== 'string' || typeof e !== 'string') {
        continue;
      }
      // Apple publishes only RS256. Anything else is refused rather than attempted.
      if (alg !== undefined && alg !== 'RS256') {
        continue;
      }
      try {
        keys.set(kid, createPublicKey({ key: { kty: 'RSA', n, e }, format: 'jwk' }));
      } catch {
        // A key we cannot import is a key we cannot verify against; skip it rather than fail
        // the whole set, so one bad rotation entry does not take down every login.
      }
    }

    if (keys.size === 0) {
      throw new Error('Apple JWKS response contained no usable RSA signing key');
    }

    this.cache = { keys, fetchedAtMs: now };
    this.logger.debug(`Apple JWKS refreshed with ${keys.size} key(s)`, 'AppleJwksService');
    return keys;
  }
}

@Injectable()
export class JwtHelper {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(
      { ...payload },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiry', '15m') as StringValue,
        algorithm: HS256,
      },
    );
  }

  generateRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiry', '7d') as StringValue,
        algorithm: HS256,
      },
    );
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwtService.verify(this.assertUsableToken(token, 'access'), {
      secret: this.configService.get<string>('jwt.secret'),
      algorithms: [HS256],
    });
  }

  verifyRefreshToken(token: string): JwtPayload & { type: string } {
    return this.jwtService.verify(this.assertUsableToken(token, 'refresh'), {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      algorithms: [HS256],
    });
  }

  /**
   * Verify an Apple `id_token` against Apple's own signing keys.
   *
   * WHY THIS EXISTS: Apple's `id_token` is RS256-signed by Apple. Verifying it with this
   * application's own HS256 secret could only ever fail, so Apple sign-in was broken; and if it
   * had ever "worked", the token would only have proven it was signed with *this* app's secret,
   * which any token this app mints for any subject would satisfy. Neither the issuer nor the
   * audience was checked, so there was no claim that made it an Apple token.
   *
   * Three things are therefore required, and all three are checked here: the signature verifies
   * against a key Apple published at appleid.apple.com/auth/keys, `iss` is Apple, and `aud` is
   * this application's client id.
   */
  async verifyAppleIdToken(
    idToken: string,
    jwks: AppleJwksService,
  ): Promise<AppleIdTokenClaims & { emailVerified?: boolean }> {
    const token = this.assertUsableToken(idToken, 'Apple id_token');

    const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
    if (headerSegment === undefined || payloadSegment === undefined || signatureSegment === undefined) {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    let header: { alg?: unknown; kid?: unknown };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8')) as { alg?: unknown; kid?: unknown };
      claims = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    const key = await jwks.resolveKey(header.kid);
    if (key === null) {
      // A key id we do not have is either a token Apple did not sign or a rotation we have not
      // seen. Either way the signature is not proved, so the login is refused.
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    const verified = createVerify('RSA-SHA256')
      .update(`${headerSegment}.${payloadSegment}`)
      .verify(key, Buffer.from(signatureSegment, 'base64url'));
    if (!verified) {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    if (claims.iss !== APPLE_ISSUER) {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    // `aud` may be a string or an array of strings, and Apple accepts the client_id in either
    // position. Without this check, a token minted for a different Apple app would be accepted.
    const expectedAudience = this.configService.get<string>('apple.clientId') ?? '';
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (expectedAudience.length === 0 || !audiences.includes(expectedAudience)) {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    const nowMs = Date.now();
    const exp = typeof claims.exp === 'number' ? claims.exp * 1000 : Number.NaN;
    if (!Number.isFinite(exp) || exp <= nowMs) {
      throw new UnauthorizedException('Invalid Apple id_token');
    }

    return {
      sub: claims.sub,
      iss: APPLE_ISSUER,
      aud: expectedAudience,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    };
  }

  /**
   * WHY: jsonwebtoken throws a bare TypeError for a missing or empty token, so any caller that
   * forwards an unchecked input turns "no token" into a 500 instead of a 401. Every verification
   * in the platform goes through this class, so the check lives here once (Principle #9) and a
   * blank credential is an authentication failure wherever it is presented.
   */
  private assertUsableToken(token: string, kind: 'access' | 'refresh' | 'Apple id_token'): string {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedException(`Invalid ${kind}`);
    }
    return token;
  }
}

/**
 * A stable, non-reversible identifier for a bearer token, for use as a cache or blocklist key.
 *
 * WHY: the refresh-token blacklist used the token itself as the Valkey key. A key is not a
 * secret store — it lands in RDB and AOF dumps, in `MONITOR` and `SLOWLOG` output, in `SCAN`
 * results and in any replica. A read path over any of those hands over directly usable refresh
 * tokens. Hashing keeps the key usable for equality (the blacklist only ever asks "have I seen
 * this exact token before?") while making the stored value useless on its own.
 */
export function fingerprintToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
