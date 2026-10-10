import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { ACCESS_TOKEN_COOKIE } from '../constants/auth-cookie.constants.ts';
import type { OptionalAuthRequest } from '../types/optional-auth-request.interface.ts';

import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.ts';

const SECRET = 'optional-guard-spec-secret-0123456789abcdef';
const OTHER_SECRET = 'optional-guard-spec-other-secret-01234';

function sign(sub: string, secret: string): string {
  return new JwtService({ secret }).sign({ sub, email: `${sub}@hakawi.com`, accountType: 'writer' });
}

/**
 * The three branches, plus the one that matters most.
 *
 * This guard exists so a public route can tell "anonymous" from "identified" without refusing the
 * anonymous case. The risk in that shape is not the first branch — it is the fourth possibility
 * nobody writes a test for: a credential that is PRESENT but cannot be verified. If that quietly
 * became "treat it as anonymous", a broken session would be answered as a successful public read,
 * and any decision the handler made from the identity would be made from nothing.
 */
describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let lastRequest: OptionalAuthRequest | undefined;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard(
      new JwtService({ secret: SECRET }),
      new ConfigService({ jwt: { secret: SECRET } }),
    );
    lastRequest = undefined;
  });

  const buildContext = (headers: Record<string, string>): ExecutionContext => {
    const request = { headers } as unknown as OptionalAuthRequest;
    lastRequest = request;

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => class TestHandler {},
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
  };

  describe('no credential', () => {
    it('should allow the request and leave request.user unset', async () => {
      await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
      expect(lastRequest?.user).toBeUndefined();
    });

    it('should not treat an unrelated authorization header as a credential to reject', async () => {
      // `JwtAuthGuard` reads the cookie when the header is not a bearer credential. Optional auth has
      // to agree about that, or a browser whose header some proxy added would be refused for a
      // request it is allowed to make. Here there is no cookie either, so this is anonymous.
      await expect(guard.canActivate(buildContext({ authorization: 'Basic dXNlcjpwYXNz' }))).resolves.toBe(true);
      expect(lastRequest?.user).toBeUndefined();
    });
  });

  describe('a credential that verifies', () => {
    it('should populate request.user with the verified claims', async () => {
      const token = sign('author-1', SECRET);

      await expect(guard.canActivate(buildContext({ authorization: `Bearer ${token}` }))).resolves.toBe(true);

      expect(lastRequest?.user?.sub).toBe('author-1');
      expect(lastRequest?.user?.accountType).toBe('writer');
    });

    it('should read the access_token cookie, the way the browser presents one', async () => {
      const token = sign('cookie-author', SECRET);

      await expect(guard.canActivate(buildContext({ cookie: `${ACCESS_TOKEN_COOKIE}=${token}` }))).resolves.toBe(true);

      expect(lastRequest?.user?.sub).toBe('cookie-author');
    });

    it('should prefer the header over a cookie, the same precedence JwtAuthGuard applies', async () => {
      const headerToken = sign('header-author', SECRET);
      const plantedCookieToken = sign('planted', SECRET);

      await guard.canActivate(
        buildContext({
          authorization: `Bearer ${headerToken}`,
          cookie: `${ACCESS_TOKEN_COOKIE}=${plantedCookieToken}`,
        }),
      );

      // The same single extraction path serves both guards, so a drift here would mean two
      // different answers to "whose identity does this request have" inside one process.
      expect(lastRequest?.user?.sub).toBe('header-author');
    });
  });

  describe('a credential that does not verify', () => {
    // All three cases collapse to one behaviour: the request proceeds as anonymous. The pin is that
    // `request.user` is UNSET — an unverifiable claim is never honoured as an identity — and that the
    // route is still served. A 401 here would sign out every reader holding an expired 15-minute
    // cookie while they read a published story, which is the availability half of Principle #14
    // failing for no security gain.
    it('should treat a token signed with another key as anonymous, never as an identity', async () => {
      const forged = sign('attacker', OTHER_SECRET);

      await expect(guard.canActivate(buildContext({ authorization: `Bearer ${forged}` }))).resolves.toBe(true);
      expect(lastRequest?.user).toBeUndefined();
    });

    it('should treat an expired token as anonymous', async () => {
      const expired = new JwtService({ secret: SECRET }).sign({
        sub: 'author-1',
        email: 'author-1@hakawi.com',
        accountType: 'writer',
        exp: Math.floor(Date.now() / 1000) - 60,
      });

      await expect(guard.canActivate(buildContext({ authorization: `Bearer ${expired}` }))).resolves.toBe(true);
      expect(lastRequest?.user).toBeUndefined();
    });

    it('should treat a string that is not a token at all as anonymous', async () => {
      await expect(guard.canActivate(buildContext({ authorization: 'Bearer not-a-jwt' }))).resolves.toBe(true);
      expect(lastRequest?.user).toBeUndefined();
    });

    it('should NOT clear a credential that did verify — the downgrade is failure-only', async () => {
      // The one case that must not regress into the fallback: a good token is still honoured on a
      // public route, which is the entire reason this guard exists.
      await expect(
        guard.canActivate(buildContext({ authorization: `Bearer ${sign('author-1', SECRET)}` })),
      ).resolves.toBe(true);
      expect(lastRequest?.user?.sub).toBe('author-1');
    });
  });
});
