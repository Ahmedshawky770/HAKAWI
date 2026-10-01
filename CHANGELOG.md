# Changelog

All notable changes to Hakawi are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Hakawi is pre-1.0, so
breaking changes are expected and are called out explicitly.

Versions are cut from `main`. The repository currently has no release tags; the initial release
number is left to the first tag rather than invented here.

## [Unreleased]

A 488-file change set was reviewed line by line and hardened. The full reasoning for every change
— including the trade-offs that were accepted rather than hidden — is in
[`docs/adr/005-security-and-correctness-hardening.md`](docs/adr/005-security-and-correctness-hardening.md).

### Security — fixed

- **Apple `id_token` was verified with the application's own HS256 secret.** Apple sign-in could
  never have succeeded, and the check that made it fail was not the check that made it safe: no
  `iss` and no `aud` verification meant that if it had ever been relaxed, any token this
  application mints for any subject would have been accepted as a valid Apple login. Now verified
  against Apple's JWKS with issuer and audience both required.
- **The refresh-token blacklist used the bearer token as its Valkey key**, exposing usable refresh
  tokens through RDB/AOF dumps, `MONITOR`, `SLOWLOG`, `SCAN` and replicas. The key is now a sha256
  of the token.
- **The blacklist TTL was a literal 7 days** while the token lifetime came from configuration, so
  `REFRESH_TOKEN_EXPIRY=30d` produced a 23-day window in which a revoked token was valid again.
  The TTL is now derived from the configured expiry.
- **A ban could be walked out of and walked back into.** `refreshTokens` never checked
  `accessBlocked`, so a blocked user kept minting access tokens for up to seven days; and OAuth was
  the one front door with no ban check, so a blocked user could sign in again through any of the
  five providers. Both are now refused.
- **`ENCRYPTION_KEY` accepted the published `.env.example` placeholder in production.** That key
  encrypts and compares password-reset tokens, so a deployment that copied the example and changed
  only the two JWT secrets ran with a known reset-token key. The published-secret rule is now
  shared by the JWT and encryption configurations.
- **500 responses returned internal error messages**, putting SQL fragments, table and column
  names, and internal paths in the response body. The body is now generic; logs and Sentry still
  receive the real message.
- **Moderation admin routes were reachable by any authenticated user.** The deleted
  `admin-dashboard.controller` declared `@RequireAdminRole` but omitted `RolesGuard` from its guard
  array, so the metadata was read by nothing. The routes now run an enforced guard chain.
- **Metrics endpoints were unauthenticated**, sitting outside the Nest routing tree. They are now
  behind `JwtAuthGuard` + `RolesGuard` + `SUPER_ADMIN`.
- **`@RequirePermissions(A, B)` granted on either permission.** The requirement now carries its
  mode as data: `@RequireAllPermissions` is AND, `@RequireAnyPermission` is the only route to OR.
- **`OwnershipGuard` was applied to zero routes**, so the IDOR it was written for was fully open.
  It is now wired on comment and story mutation routes through per-module repository resolvers.
- Password-reset token comparison now uses `crypto.timingSafeEqual` instead of `!==`.
- JWT signing and verification now pin `algorithms: ['HS256']`.

### Security — hardened

- **Four WAF rules matched ordinary prose and could trigger a one-hour IP block.** Verified
  examples included `"steps & id check"`, `"the book made me sleep( a lot"`, `"(uid=*) group"` and
  `"Please confirm( your email address"`. The *patterns* were tightened rather than the severities
  lowered, because downgrading would have traded a false positive for a silent loss of detection.
  Result: 0 false positives on a 26-prose corpus with 0 missed attacks on a 40-attack corpus.
- **SSRF rules could not match the encodings they implied.** Added coverage for link-local
  `169.254/16`, CGNAT `100.64/10`, IPv6 ULA, IPv6 link-local, IPv4-mapped IPv6 loopback, the
  inet_aton short forms, and the decimal/hex/octal integer encodings of `127.0.0.1`.
- **The body-size limit was bypassable with `Transfer-Encoding: chunked`,** and the rule's own
  description claimed it rejected an oversized upload "without being buffered" when the body had
  already been parsed. The detection control was rewritten and the description now states which
  control detects and which one prevents.
- **Percent-decoding ran exactly twice**, leaving triple-encoded payloads intact. It now runs to a
  fixed point, bounded.
- **`WAF_ENABLED=false` did not disable the WAF** — the blocklist lookup ran first, costing a
  Valkey GET per request even when the WAF was off.
- **A global rate-limit override was one stray variable away from silently disabling rate
  limiting in production.** It now requires an explicit acknowledgement and is fatal under
  `NODE_ENV=production`.
- Token refresh no longer shares the human login rate-limit budget. A dedicated `session` tier
  prevents ten automatic refreshes behind one office NAT from logging out every user behind it.
- The rate-limit default was corrected from an accidental 10× loosening (100/min) to 30/min.
- `.env.example` documented `TIKTOK_CLIENT_ID` and `FACEBOOK_CLIENT_ID` where the code reads
  `TIKTOK_CLIENT_KEY` and `FACEBOOK_APP_ID`, and omitted all five OAuth callback URLs, so every
  provider silently fell back to `localhost` in production.
- `next@16.3.5` carried a critical remote-code-execution advisory (`GHSA-vcvr-r3jv-pc5j`,
  `next/og` `ImageResponse`). Upgraded to `16.3.8`; `npm audit --omit=dev` is now clean.
- `@playwright/test` and an unimported `@nestjs/observe` were in production dependencies.
  `@nestjs/testing` was in the root production tree.

### Fixed

- **Top-level comments were always empty.** `eq(comments.parentId, null)` compiled to
  `parent_id = NULL`, which SQL evaluates to `NULL` and is therefore never true. Now uses
  `isNull(...)`, and the row query and count query share one predicate so page and count cannot
  drift.
- **Migrations could be executed out of order.** With `0000` applied, `0001` pending and `0002`
  applied, the drift check compared against a running maximum and let `0001` pass — so `0001` ran
  *after* `0002`. The repository has a live sequence gap at 0017, so this was reachable. The applied
  migrations must now form a prefix of the file order.
- **Two concurrent `migration:run` invocations had no mutual exclusion**, which can raise a
  duplicate-key error on `pg_type` or deadlock. `up` and `down` now take a session advisory lock.
- **A blocked migration hung with no diagnostic.** Each migration transaction sets a lock timeout
  and a statement timeout.
- **The entire migration history reported the same application date**, because adding `applied_at`
  backfilled every legacy row with the adoption timestamp. The real `executed_at` is now restored.
- **The search count query used a different `tsvector` configuration than the rows query**, so
  `total` did not match the results and pagination was wrong whenever stemming changed a match.
- **The WebSocket adapter read `REDIS_*` while everything else read `VALKEY_*`.** Under Docker
  Compose the cache connected correctly while the adapter fell back to `localhost:6379` — silent
  loss of cross-instance event fan-out. The connection is now resolved once, from shared config.
- **Non-atomic `INCR` + conditional `EXPIRE`** in the WAF violation counter and the throttler
  storage could orphan a key with no TTL. For the WAF counter, which only rises, that meant a
  **permanent block with no expiry and no recovery**. Both now use a Lua script that establishes the
  counter and its TTL in one atomic step, without sliding the window forward.
- The OAuth CSRF state write is now awaited, so a callback cannot race it and a Valkey failure is
  no longer an unhandled rejection.
- `db:studio` had never worked: `drizzle-kit` and `dotenv` were imported by `drizzle.config.ts` and
  declared in no package.json. Both are now declared.
- `backend/push-schema.ts` — a divergent third schema bootstrap creating a table that does not
  exist in the Drizzle schema — was deleted.
- The frontend dashboard route `/dashboard` was a dead link; it pointed at a route that never
  existed.

### Changed

- Lint and format are now **checkers**, not mutators: `eslint` without `--fix` and
  `prettier --check`. Both are CI gates now.
- `test-e2e` and `test-browser` are now dependencies of the `build` job, so a green build can no
  longer be published on top of red browser tests.
- CI's `migration-verify` job was renamed **Migration Smoke Test (from scratch)**. It previously
  applied migrations to a fresh database and then verified the ledger it had just written — a
  tautology. It now also re-applies the chain, which is a real assertion: every migration is
  self-contained, in order, and idempotent.
- `migration:status` and `migration:verify` no longer run ledger DDL, so they no longer require
  write privileges on a production database.
- `migrations/drizzle-draft/` is now gitignored, so generated drafts cannot be mistaken for real
  migrations.
- The WAF's own known limits are now written down in `backend/src/common/waf/README.md` instead of
  being left for a reader to discover.

### Added

- A fifth rate-limit tier, `session`, for machine-driven token refresh.
- `AppleJwksService` with in-process key caching and rotation support.
- `ValkeyService.incrWithTtl` — an atomic counter-with-TTL primitive, replacing two separate
  copies of the same non-atomic pattern.
- Shared configuration for the published-secret rule, and a shared Valkey connection resolver.
- 22 environment variables that the code read but `.env.example` omitted; the 18 that are
  documented but read by nothing are now marked as such in the file.
- Regression tests for every fix above, including the sandwiched-migration case, the SSRF encoding
  bypasses, the WAF prose corpus, Apple `id_token` verification against real RSA keys, and the
  constant-time reset-token comparison.

### Verification

| Gate | Result |
|---|---|
| Backend tests | 2918 passed / 139 files |
| Frontend tests | 340 passed / 21 files |
| `tsc --noEmit` (backend, frontend, shared-types) | clean |
| `eslint src/ test/ e2e/` | 0 errors |
| `prettier --check` | clean |
| `npm run db:check` | pass, 2 documented warnings |
| `npm audit --omit=dev` | 0 vulnerabilities |
