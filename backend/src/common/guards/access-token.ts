import type { Request } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';

import { ACCESS_TOKEN_COOKIE, parseCookieHeader } from '../constants/auth-cookie.constants.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

/**
 * The ONE place that decides where a bearer credential comes from and how it is checked.
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT A MIXIN OR A BASE CLASS. `JwtAuthGuard` held both
 * concerns as `private` members, and the second consumer of the token (a public route that needs
 * to know a reader's identity *if* one was presented) can only be given access to them by copying
 * them. A copy is a second source of truth that drifts: the header-before-cookie precedence
 * documented below is a security property, not a preference, and a guard that re-spells it will
 * eventually disagree with the guard on the protected routes about whose identity a request has.
 * Two functions that both guards call is the only arrangement where they cannot.
 *
 * WHY FUNCTIONS AND NOT AN INJECTABLE CLASS. `JwtAuthGuard`'s constructor is
 * `(Reflector, JwtService, ConfigService)` and every one of its call sites — including
 * `jwt-auth.guard.spec.ts` — builds it with exactly those three arguments. Handing it a fourth
 * injected dependency would change a signature on the guard protecting every protected route in
 * the application for no behavioural gain; passing the two collaborators the verification already
 * needs keeps that constructor, and every behaviour it has, untouched.
 */
export function extractAccessToken(request: Request): string | undefined {
  // WHY the header wins: the auth cookies are written with `path: '/'` and no `domain`, so any
  // host that can set a cookie for the parent domain — a sibling subdomain, a staging deploy on
  // a shared zone — can also write one named `access_token`. If the cookie were read first, that
  // attacker-chosen value would decide the caller's identity while the genuine header token was
  // ignored. The header is the credential the caller attached to this request on purpose, so it
  // takes precedence; the cookie is only the fallback for the browser that cannot set a header
  // on a cross-origin fetch. (Principle #15: assume the ambient credential can be poisoned.)
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  if (type === 'Bearer' && token !== undefined && token.length > 0) {
    return token;
  }

  return parseCookieHeader(request.headers.cookie)[ACCESS_TOKEN_COOKIE];
}

/**
 * Verifies an access token against `jwt.secret`.
 *
 * The thrown error is the driver's own (`jsonwebtoken`), deliberately NOT translated here: the two
 * guards own different wording for the same failure (`JwtAuthGuard` has always answered
 * 'Invalid or expired token', and `OptionalJwtAuthGuard` answers the same thing), and a helper that
 * threw an HTTP exception would drag `HttpException` into a module that is otherwise pure
 * verification. Each guard decides what its own contract says; this function only proves a signature.
 */
export function verifyAccessToken(
  jwtService: JwtService,
  configService: ConfigService,
  token: string,
): Promise<JwtPayload> {
  return jwtService.verifyAsync<JwtPayload>(token, {
    secret: configService.get<string>('jwt.secret'),
  });
}
