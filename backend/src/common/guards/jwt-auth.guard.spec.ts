import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { ACCESS_TOKEN_COOKIE } from '../constants/auth-cookie.constants.ts';
import { IS_PUBLIC_KEY } from '../decorators/roles.decorator.ts';
import type { AuthRequest } from '../types/auth-request.interface.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import { JwtAuthGuard } from './jwt-auth.guard.ts';

const SECRET = 'guard-spec-access-secret-0123456789abcdef';
const OTHER_SECRET = 'guard-spec-other-secret-0123456789abcdef';

function sign(sub: string, secret: string): string {
  return new JwtService({ secret }).sign({ sub, email: `${sub}@hakawi.com`, accountType: 'reader' });
}

interface Scenario {
  readonly authorization?: string;
  readonly cookie?: string;
  readonly secret?: string;
}

describe('JwtAuthGuard token source', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let lastRequest: AuthRequest | undefined;

  beforeEach(() => {
    jwtService = new JwtService({ secret: SECRET });
    guard = new JwtAuthGuard(new Reflector(), jwtService, new ConfigService({ jwt: { secret: SECRET } }));
    lastRequest = undefined;
  });

  const buildContext = (scenario: Scenario): ExecutionContext => {
    const headers: Record<string, string> = {};
    if (scenario.authorization !== undefined) {
      headers.authorization = scenario.authorization;
    }
    if (scenario.cookie !== undefined) {
      headers.cookie = scenario.cookie;
    }

    const request = { headers } as unknown as AuthRequest;
    lastRequest = request;

    const handler = class TestHandler {};
    const controller = class TestController {};

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
  };

  const subjectAfter = async (scenario: Scenario): Promise<string | undefined> => {
    await guard.canActivate(buildContext(scenario));
    return lastRequest?.user?.sub;
  };

  it('accepts a bearer token from the Authorization header', async () => {
    const token = sign('header-user', SECRET);

    expect(await subjectAfter({ authorization: `Bearer ${token}` })).toBe('header-user');
  });

  it('falls back to the access_token cookie when the request carries no header', async () => {
    const token = sign('cookie-user', SECRET);

    expect(await subjectAfter({ cookie: `${ACCESS_TOKEN_COOKIE}=${token}` })).toBe('cookie-user');
  });

  // WHY: the cookies are set on path '/' with no domain, so a sibling subdomain can plant an
  // `access_token` cookie of its own. Reading the cookie first would let that planted value decide
  // the caller's identity while the genuine header token was ignored.
  it('prefers the header token over a cookie of a different identity', async () => {
    const headerToken = sign('header-user', SECRET);
    const plantedCookieToken = sign('planted-user', SECRET);

    expect(
      await subjectAfter({
        authorization: `Bearer ${headerToken}`,
        cookie: `${ACCESS_TOKEN_COOKIE}=${plantedCookieToken}`,
      }),
    ).toBe('header-user');
  });

  it('rejects the planted cookie when the header token it shadows is forged', async () => {
    const forged = sign('attacker', OTHER_SECRET);
    const plantedCookieToken = sign('victim', SECRET);

    await expect(
      guard.canActivate(
        buildContext({
          authorization: `Bearer ${forged}`,
          cookie: `${ACCESS_TOKEN_COOKIE}=${plantedCookieToken}`,
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('reads the cookie when the header is not a bearer credential', async () => {
    const token = sign('cookie-user', SECRET);

    expect(await subjectAfter({ authorization: 'Basic dXNlcjpwYXNz', cookie: `${ACCESS_TOKEN_COOKIE}=${token}` })).toBe(
      'cookie-user',
    );
  });

  it('reads the cookie when the bearer header names no token', async () => {
    const token = sign('cookie-user', SECRET);

    expect(await subjectAfter({ authorization: 'Bearer', cookie: `${ACCESS_TOKEN_COOKIE}=${token}` })).toBe(
      'cookie-user',
    );
  });

  it('reads the cookie when the bearer header carries an empty token', async () => {
    const token = sign('cookie-user', SECRET);

    expect(await subjectAfter({ authorization: 'Bearer ', cookie: `${ACCESS_TOKEN_COOKIE}=${token}` })).toBe(
      'cookie-user',
    );
  });

  it('rejects a request with neither source', async () => {
    await expect(guard.canActivate(buildContext({}))).rejects.toThrow('No token provided');
  });

  it('rejects a token signed with the refresh secret, which is the only thing that separates the two', async () => {
    const refreshSecretToken = sign('user-1', OTHER_SECRET);

    await expect(guard.canActivate(buildContext({ authorization: `Bearer ${refreshSecretToken}` }))).rejects.toThrow(
      'Invalid or expired token',
    );
  });

  it('lets a public route through without inspecting any credential', async () => {
    const handler = class PublicHandler {};
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

    const request = { headers: {} } as unknown as AuthRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => class PublicController {},
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('JwtAuthGuard payload typing', () => {
  it('exposes the verified claims on the request as a JwtPayload', async () => {
    const jwtService = new JwtService({ secret: SECRET });
    const guard = new JwtAuthGuard(new Reflector(), jwtService, new ConfigService({ jwt: { secret: SECRET } }));
    const token = jwtService.sign({ sub: 'user-9', email: 'user-9@hakawi.com', accountType: 'reader' });
    const request = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => class TestHandler {},
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;

    await guard.canActivate(context);

    const claims: JwtPayload | undefined = request.user;
    expect(claims?.sub).toBe('user-9');
  });
});
