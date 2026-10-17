# Auth Module

## Overview

Handles user authentication and authorization for the Hakawi platform.

## Endpoints

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login with email and password
- `POST /api/v1/auth/refresh` - Refresh access token (cookie or body, see Refresh token sources)
- `GET /api/v1/auth/session` - Get current session
- `POST /api/v1/auth/logout` - Logout and blacklist refresh token
- `GET /api/v1/auth/oauth/:provider` - OAuth login (Google, Facebook, Twitter, GitHub, Apple, TikTok)

## Technologies

- JWT for access tokens
- bcrypt for password hashing
- Valkey for refresh token blacklist
- Passport.js for OAuth strategies

## Security

- Passwords are hashed with bcrypt (**12 rounds** — `backend/src/common/utils/password.util.ts:25`,
  pinned by `password.util.spec.ts:67`, which reads the cost back out of the hash rather than spying
  on bcrypt). This README previously said **10**, which the code has not used.
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Refresh tokens are blacklisted on logout
- Rate limiting: 10 requests per minute per IP
- A refresh token is burned **before** its replacement is minted, so a replayed token cannot
  produce a second live pair
- The `Authorization: Bearer` header is preferred over the `access_token` cookie, so a cookie
  planted by a sibling subdomain cannot shadow a genuine credential
- `JWT_SECRET` / `REFRESH_TOKEN_SECRET` may fall back to a built-in development value, but never
  under `NODE_ENV=production` (see Secrets)

## Refresh token sources

A refresh token arrives from one of two places, and `auth.controller.ts` resolves both through a
single helper (`resolveRefreshToken`) used by `/refresh` and `/logout` alike:

1. the `refresh_token` httpOnly cookie — the browser path, since httpOnly means JavaScript cannot
   read the value back;
2. `refreshToken` in the request body — the non-browser path (mobile, CLI, service accounts).

The cookie wins when both are present; the body is only a fallback. A request with neither is
refused with `401` and the auth cookies are cleared, so a browser stops retrying with cookies that
can no longer work. On a 5xx the cookies are deliberately left alone: a server fault is not a dead
session, and clearing there would sign the user out over an outage.

`RefreshTokenDto.refreshToken` is therefore optional. It has to be: with the global
`ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) a required field turns a cookie-only refresh
into a 400 before the controller can read the cookie.

## OAuth identity fallback

Providers are inconsistent about a missing email, so `utils/oauth-email.util.ts` owns one rule:
**null, undefined, empty and whitespace-only are all "absent"**, and the address falls back to
`<provider account id>@<provider placeholder domain>` (`types/oauth.types.ts`).

That rule is not cosmetic. `email` was previously guarded with `||`, which honoured it; changing
it to `??` to satisfy a lint rule silently dropped the blank cases, and `findOrCreateOAuthUser`
then wrote `email: ''`. Because every blank address is the same value to the unique index, the
second such sign-in either collided with the first or bypassed the constraint that makes accounts
unique. The fallback is derived from the provider's own account id, so two providers that withhold
their email still get distinct, reproducible addresses in a reserved `.user` namespace.

Every provider — including TikTok, which has no email field at all — goes through the same helper,
so the rule cannot be forgotten at the sixth call site.

## Secrets

`config/jwt.config.ts` exposes `buildJwtConfig(env)` so the rules are testable without a process
environment, and `registerAs('jwt', …)` wraps it for the running app.

- Off production, an unset or blank `JWT_SECRET` / `REFRESH_TOKEN_SECRET` reads as the documented
  development value. The unit suite boots parts of the auth stack with no environment at all, and a
  value-less secret would fail the 32-character rule for every one of them.
- Under `NODE_ENV=production` the built-in defaults **and** the placeholders that ship in
  `.env.example` are refused by name, and `buildJwtConfig` throws a single readable line. A
  deployment that forgets its environment now stops at boot instead of minting tokens that anybody
  who has read this repository can forge.
- A secret shorter than 32 characters is refused in every environment.

## Bans stop authentication

A moderator's ban was enforced everywhere except the places that mint a session.

`ModerationService.takeAction` writes a `user_restrictions` row and `ModerationEventHandler` writes the
cache key `restriction:<userId>` holding `'ban'`, with the TTL from `moderation/restriction-policy.ts`.
`RestrictionGuard` reads that key on every `@Secured` route — but the auth routes are `@Public()`, so
the guard never runs on them. `AuthService` was instead checking `users.accessBlocked`, and **nothing
in `backend/src` ever writes that column**: it appears in the Drizzle schema, in two users response
DTOs and in the auth spec, and in no write anywhere. The result was a banned account locked out of
every authenticated route that could still log in, refresh its tokens for up to seven days, and sign
in through any of the five OAuth providers.

`login`, `refreshTokens` and `findOrCreateOAuthUser` now all refuse an account whose **current**
restriction is `ban`, read through `common/services/account-restriction.service.ts` — the same reader
`RestrictionGuard` uses, so the two cannot disagree about whether an account is banned (Principle #9).

- **Only `ban` blocks authentication.** A `mute` is a write restriction: the guard enforces it as 423
  on a write and lets reads through. Logging in is how a muted account reaches the content it is still
  allowed to read, so treating a mute as a login restriction would turn a mute into the full lockout
  it deliberately is not.
- **The check sits after the password comparison** in `login`. Before it, the endpoint would refuse a
  banned account without a valid password — an account-existence signal to an unauthenticated caller.
- **`accessBlocked` is still checked.** It is a manual override with no in-app writer today, and
  removing a column check because it is currently redundant is how a second control quietly
  disappears.
- **A Valkey driver failure fails open** and is logged at ERROR with the account id. A cache outage
  must not become an authentication outage (Principle #12) — the cost is a ban unenforced for the
  length of the outage, which is the same posture the guard and the WAF blocklist already take, and
  strictly better than 503-ing every login in the product for a cache fault.

## Password reset mail

`forgotPassword` used to mint a UUID, encrypt it into `users.password_reset_token`, store the raw
UUID in Valkey and emit a tokenless `password.reset.requested` event that nothing listened to.
`resetPassword` reads that Valkey key, so the code worked — but no user could ever receive the UUID,
which made password reset unreachable end-to-end.

The code is now delivered from the method that mints it, through the single transport in
`common/email/`. The response stays the generic `'If the email exists, a reset email has been sent'`:
a caller that could distinguish "no such account" from "the mail server refused" could enumerate
registered addresses through an unauthenticated endpoint. The delivery outcome is logged instead, and
an SMTP outage never becomes a 500 (Principle #14 — sending is a side effect).

The reset token never appears on an event payload or in a log line. Events are logged,
dead-lettered and replayed; Winston output is aggregated and retained. A token in either is a
credential with a very long half-life (Principle #15).

## Logout

Logout is idempotent: a client with no session still gets `200`. The message distinguishes the two
cases, because the previous wording claimed a security effect that had not happened — it read in a
log review as "the session was killed" for a request that revoked nothing. `200` with a `message`
is unchanged, and the "no token presented" signal goes to the log as a warning.

## Known gaps

- The reuse check and the blacklist write are two Valkey round trips, so two refreshes of the same
  token that overlap _between_ those two calls can both succeed. Closing that needs a single atomic
  set-if-absent in `ValkeyService`, which does not expose one today. The narrow window is the
  price of failing closed on minting errors.
- `JwtAuthGuard` separates access from refresh tokens by secret only; it does not reject a payload
  carrying `type: 'refresh'`. With `JWT_SECRET === REFRESH_TOKEN_SECRET` that separation is gone.

## What moderation does NOT write

For anyone re-checking the ban path above: `grep -rn "accessBlocked" backend/src` returns the Drizzle
schema, the users response DTOs, the shared repository interface, the auth spec and the three
`AuthService` reads — and no write. `UpdateUserDto` does not expose it, so `PATCH /users/:id` cannot
set it either. The column is a manual override an operator could populate directly in Postgres; it is
not what moderation produces.
