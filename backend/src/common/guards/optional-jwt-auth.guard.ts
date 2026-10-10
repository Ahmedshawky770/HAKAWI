import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { OptionalAuthRequest } from '../types/optional-auth-request.interface.ts';

import { extractAccessToken, verifyAccessToken } from './access-token.ts';

/**
 * Optional authentication: who is this caller *if* they chose to say?
 *
 * ## Why this guard exists at all
 *
 * Some public routes have a second, narrower answer for an identified reader than for an anonymous
 * one — an author loading their own unpublished draft, for instance. Expressing that needs the
 * caller's identity, and `JwtAuthGuard` cannot supply it: it is not an `APP_GUARD`, it is attached
 * per route by `@Secured()`/`@UseGuards`, and on a `@Public()` route it returns before it looks at
 * any credential, so `request.user` is never populated. That is the correct behaviour for it — a
 * public route must not be refused for lack of a token — which means the identity has to come from
 * somewhere that is optional by construction.
 *
 * The alternative, and why it was rejected: putting `@Public()` and `JwtAuthGuard` on the same route
 * would leave `JwtAuthGuard` returning early and still populate nothing, so the handler would have
 * to make the credential optional itself. That pushes token parsing into a controller — the layer
 * that owns none of it, per Principle #7 — and it would be re-implemented per route.
 *
 * ## The three branches, and why the third falls back to 1
 *
 * 1. **No credential at all → allowed, `request.user` left unset.** This is the whole point: the
 *    route stays public. Nothing is written to the request, so a handler that reads `request.user`
 *    sees exactly what an unauthenticated request sees.
 * 2. **Credential present and valid → allowed, `request.user` set** to the verified `JwtPayload`.
 *    Identical to what `JwtAuthGuard` assigns, via the same `verifyAccessToken`.
 * 3. **Credential present but invalid, expired, or signed with another key → treated as anonymous.**
 *    The request proceeds with `request.user` unset. It is NOT honoured as an identity, and it is
 *    NOT an error.
 *
 * WHY 3 IS A FALLBACK AND NOT A 401 — this was 401, and that was wrong for this codebase.
 *
 * The security property that matters is "an unverifiable claim is never trusted as an identity".
 * Falling back to branch 1 preserves that property exactly: `request.user` stays unset, so the
 * handler applies its rule to an anonymous caller and the reader gets the anonymous answer. Nothing
 * is granted. What a 401 adds is not safety; it is a refusal.
 *
 * And the refusal is expensive, because this client authenticates by cookie, not header. `api.ts`
 * sends `credentials: "include"` and never sets `Authorization`; the `access_token` cookie lives
 * 15 minutes. So *every* reader who browses past that boundary holds a stale cookie, and a 401 on a
 * `@Public()` route reaches `handleResponse`, which clears the stored user and signs them out —
 * while trying to read a published story. An expired session would deny anonymous access to public
 * content. That is the availability half of Principle #14 failing for no security gain: published
 * stories are eventual-consistency data, the credential is not trusted either way, and the only
 * thing 401 changes is that a reader is logged out for it.
 *
 * The cost of this choice, stated plainly: an author whose access token has expired now gets 404
 * on their own draft instead of a 401 telling them to refresh. That is the right side to fail on —
 * it is one person re-authenticating, rather than every reader being signed out. The client already
 * owns the remedy (refresh via the `refresh_token`, or `POST /auth/logout` to drop the cookies),
 * and `JwtAuthGuard` still returns 401 for the same token on every *protected* route, so genuine
 * authentication failure is still reported loudly where authentication is actually required.
 *
 * ## What this guard is not
 *
 * It grants nothing. It answers "who is this caller", not "may this caller read this". Every use has
 * to pass the identity to the layer that owns the rule, which is where the allow/deny decision is
 * made — in `StoriesService`, next to the `deletedAt` check, for the story detail routes.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OptionalAuthRequest>();
    const token = extractAccessToken(request);
    if (token === undefined) {
      return true;
    }

    // An unusable credential is treated as no credential: `request.user` stays unset, so the handler
    // applies its rule to an anonymous caller. It is never honoured as an identity. See the class
    // comment — a 401 here would sign out every reader holding an expired 15-minute cookie while
    // they read a published story.
    try {
      request.user = await verifyAccessToken(this.jwtService, this.configService, token);
    } catch {
      request.user = undefined;
    }
    return true;
  }
}
