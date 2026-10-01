# ADR 005 — Security and correctness hardening of the unreviewed change set

- **Status:** Accepted
- **Date:** 2026-10-01
- **Supersedes:** nothing
- **Related:** `docs/01_ARCHITECTURE_PRINCIPLES.md`, `backend/src/common/waf/README.md`,
  `backend/src/db/migrations/README.md`, `backend/src/common/guards/README.md`

## Context

A 488-file change set sat uncommitted in the working tree: 347 modified, 141 new, 8 deleted,
+27,511 / −24,739 lines. A read-only review classified every hunk as beneficial, harmful, neutral
or risky. Roughly 70% was a genuine improvement; the remainder contained five merge-blocking
defects, one authentication bypass waiting for its bug to be "fixed", and several controls that
looked present but could not work.

This ADR records what was changed and, more importantly, **why each change looks the way it
does**. Several fixes are deliberately not the obvious ones, and the reasoning is written down so
the next person does not "simplify" a correction back into the bug it replaced.

Principle #4 requires that a problem solved but not documented is a problem waiting to be solved
again. That is the whole reason this file exists.

## Decisions

### 1. CI gates: check, do not mutate

`lint` changed from `eslint src/ --fix` to a checker, and `format` from `prettier --write` to
`prettier --check`. Both are correct. Neither was usable: seven files were unformatted, so the new
gate failed on the first push. Those seven were formatted individually.

**Principle #17 forbids mass automated formatting.** Running `format:fix` across the repository
would have rewritten far more than seven files at ~120 columns. The seven were listed, formatted,
and reviewed by hand.

`build` now also `needs: [test-e2e, test-browser]`, so a green build can no longer be published on
top of red browser tests.

### 2. `test-e2e` could not resolve `@hakawi/shared-types`

`backend/vitest.config.e2e.ts` had no `resolve.alias`, while `backend/vitest.config.ts` did. Since
`packages/shared-types/dist` is gitignored, a clean runner had no artifact to resolve. Two
independent fixes, either of which suffices:

- `vitest.config.e2e.ts` now aliases the package to its source, exactly as the unit harness does.
  This is the real fix: it removes the build-order dependency entirely (Principle #9 — one way to
  resolve the package, not two).
- The CI job also builds `shared-types`, matching the other four jobs. Kept so the job is
  self-explanatory and every workspace uses the same artefact.

The stale comment claiming the frontend does not need the build was corrected: the frontend no
longer maps the package through tsconfig `paths` and resolves it through `node_modules` too.

### 3. Apple `id_token` was verified with the application's own HMAC secret

`auth.service.ts` called `verifyAccessToken(tokenData.id_token)`. Apple's `id_token` is RS256
signed by Apple, so **Apple sign-in could never have succeeded** — the verification threw, and the
controller redirected to `?error=oauth_failed`.

The failure is the lesser problem. If it had ever been "fixed" by relaxing the check, the token
would only have proved it was signed with *this application's* secret — which any token this
application mints, for any subject, satisfies. Neither `iss` nor `aud` was checked, so nothing in
the token made it an Apple token.

`JwtHelper.verifyAppleIdToken` now requires all three:

1. the signature verifies against a key Apple published at `appleid.apple.com/auth/keys`,
2. `iss === 'https://appleid.apple.com'`,
3. `aud` contains `APPLE_CLIENT_ID` (accepted as a string or an array).

The JWKS is fetched through `AppleJwksService` and cached in-process for six hours, because Apple
rotates its keys and they cannot be pinned in configuration. Only `RS256` is accepted, and only
RSA keys are imported.

`APPLE_CLIENT_ID` moved into `jwt.config.ts` so the audience check reads validated configuration
rather than `process.env`. When it is unset, **every** audience is refused — the safe direction.

The suite generates a real 2048-bit RSA key pair and signs real tokens, so the signature path is
genuinely exercised rather than stubbed to `true`.

### 4. JWT algorithm pinning

`jwt.util.ts` and the module-level `JwtService` now pass `algorithms: ['HS256']`. Both secrets are
HMAC, so the practical risk today is low. The reason to pin is that a future move to asymmetric keys
must then be a deliberate edit of one line rather than a silent widening of the contract.

### 5. The refresh blacklist used the bearer token as its Valkey key

`refresh_token:blacklist:<the token itself>`. A Valkey key is not a secret store: it is written to
RDB and AOF dumps, appears in `MONITOR` and `SLOWLOG` output, in `SCAN` results, and on every
replica. Any read path over any of those yielded directly usable refresh tokens.

The key is now `sha256(token)`. The blacklist only ever asks "have I seen this exact token
before?", which a hash answers just as well.

### 6. The blacklist TTL was decoupled from the token lifetime

The TTL was a literal 7 days while the token lifetime came from `jwt.refreshExpiry`. An operator
who set `REFRESH_TOKEN_EXPIRY=30d` got a blacklist entry that expired on day 7 — **a token
revoked at logout became usable again from day 7 onwards, for another 23 days.**

The TTL is now derived from the configured expiry. `parseDurationToMs` returns `null` for
anything it does not understand rather than guessing a number, and the caller falls back to the
documented default and warns.

### 7. A ban could be walked out of, and a blocked user could walk back in

`login` checked `user.accessBlocked`. Two paths did not:

- **`refreshTokens`** — silent and cookie-driven, so a user blocked while holding a valid refresh
  token kept minting access tokens for up to seven days, with no login and no event in the log. The
  check is now there, and the presented token is burned on refusal so it cannot be retried.
- **`findOrCreateOAuthUser`** — OAuth was the one front door with no ban check. The provider lookup
  returned the account and tokens were minted without reading the flag, so a blocked user could
  sign in again through any of the five providers.

Both are now refused. `login` is unchanged.

### 8. Four WAF rules blocked ordinary prose

`WAF_BLOCK_SEVERITY` defaults to `high`, so `high` and `critical` rules **block**, and five
violations inside a 900-second window produce a **one-hour IP block**. Four rules matched ordinary
English and technical prose — verified empirically before the fix:

| rule | matched prose |
|---|---|
| `xss-script-function` | `"Please confirm( your email address"`, `"window.location = url"`, `"Use atob( to decode this"` |
| `command-chain-separator` | `"steps & id check"`, `"He whispered; kill the process"`, `"Run this; curl the file"` |
| `sql-time-based` | `"the book made me sleep( a lot"` |
| `ldap-filter-injection` | `"(uid=*) group"` |

On a story-writing platform this is a denial-of-service vector against authors, and behind a shared
egress it locks out everyone behind it. Hakawi was already applying exactly this reasoning to
`sql-exec-eval`, which was deliberately set to `medium` for the same reason — the treatment was
simply not extended to the other four.

**Severity was not lowered. The patterns were tightened**, because downgrading would have traded a
false positive for a silent loss of detection at `WAF_BLOCK_SEVERITY=medium`:

- `xss-script-function` now requires a JavaScript-shaped co-signal: a single-token or quoted
  argument terminated by `,` or `)`, a `document.*` read in executable position, or a quoted
  `window.location` assignment.
- `command-chain-separator` requires a shell-shaped argument (flag, path, URL, wildcard, subshell),
  or a hostile terminator rather than any conjunction for the argumentless commands.
- `sql-time-based` requires a **numeric** argument, because the argument *is* the delay.
- `ldap-filter-injection` requires a closing metacharacter followed by an opened filter group set
  to the universal wildcard — the only position at which a filter can be extended.

Result: **0 prose false positives and 0 missed attacks** across a 26-prose / 40-attack corpus.
One trade-off is documented in the rule: `confirm(are you sure)` is now treated as prose, because
the alternative is banning the English word "confirm" followed by a bracket.

### 9. SSRF rules could not match what they claimed

A review claimed `192.168` and `172.16` were missed. **That claim was wrong** — testing showed
both match. The real gaps, all confirmed empirically:

| bypass | status before |
|---|---|
| `http://169.254.1.1/` (link-local, not the metadata IP) | missed |
| `http://[::ffff:127.0.0.1]/` (IPv4-mapped IPv6) | missed |
| `http://[fd00::1]/` (IPv6 ULA) | missed |
| `http://100.64.0.1/` (CGNAT) | missed |
| `http://2130706433/`, `http://0x7f000001/`, `http://0177.0.0.1/` | missed |

The existing rule was widened, and a second rule `ssrf-encoded-host` was added for host *shapes*
that are not a plain dotted decimal. All 18 attack vectors and 15 benign URLs were verified.

**Scope is stated honestly in the rule:** a regex is not a URL parser, and a mixed form such as
`http://0x7f.0x0.0x0.0x1/` is not matched. The durable fix is to normalise the host with
`new URL(...).hostname` before the rules run. Hakawi has no user-supplied URL fetch sink today, so
the gap is latent rather than live, and it is recorded rather than papered over.

### 10. The body-size limit was bypassable with `Transfer-Encoding: chunked`

The rule returned early when `Content-Length` was absent or unparseable — which is exactly what a
chunked request does. Its own description claimed it was "enforced before the body is parsed so an
oversized upload is rejected without being buffered", which was false: `express.json` is mounted
before the WAF.

`measureBodyBytes` now falls back to the bytes actually received, read from the `verify` hook's
captured `rawBody`. The rule description and `requestSizeLimit` in `main.ts` now state which
control detects and which prevents. **Detection is not prevention**: by the time the WAF runs the
body is in memory, and the control that aborts the stream is `express.json({ limit })`.

### 11. Percent-decoding ran exactly twice

`for (let pass = 0; pass < 2; pass += 1)` left `%25252e` — triple-encoded — intact. The loop now
runs until the value stops changing, bounded by `MAX_DECODE_PASSES = 8` so a deeply-nested
encoding cannot burn CPU here.

### 12. `WAF_ENABLED=false` did not disable the WAF

`lookupBlock` ran before `this.config.enabled` was consulted, so an operator who switched the WAF
off kept a live Valkey-backed denylist and a Valkey GET on **every** request, with a degradation
warning per request during an outage. The enabled check now precedes it.

### 13. `INCR` then conditional `EXPIRE` could orphan a key with no TTL

Both `IpBlocklistService.recordViolation` and the throttler storage used that shape. A process
death between the two commands leaves a key with no expiry.

For the WAF violation counter, which only ever rises, that is permanent: the key eventually crosses
`violationsBeforePermanentBlock` at an arbitrary future moment and blocks a real user with **no
expiry and no way out** except direct Valkey manipulation.

`ValkeyService.incrWithTtl` runs `SET key 0 EX ttl NX` and `INCR` in one Lua script. `NX` means
the TTL is not refreshed on every hit, so the window cannot slide forward — a slow attacker could
otherwise accumulate a permanent total without ever tripping a temporary block. The regression
tests assert on the resulting expiry, not on an `EXPIRE` round trip, because that round trip is
what the fix removed.

### 14. The default rate limit was loosened tenfold

The `default` tier became the fallback for every undecorated route, at 100/min — against a
previous global limit of 10/min. Worse, the tier declares `tracker: 'user'`, but `JwtAuthGuard` is
not an `APP_GUARD`, so Nest runs global enhancers *before* route guards and `request.user` is unset
when `ThrottlerGuard` runs. The `default`, `upload` and `search` tiers are therefore all **per-IP
in practice**, contradicting `.env.example` and the config comments.

`default` is now **30/min** — comfortably above interactive browsing, and low enough to bound a
single address. The `user`-tracker caveat is now written into the rule itself rather than left for
a reader to discover.

### 15. Token refresh shared the human login budget

`/auth/refresh` is `@Public()` and now resolves its token from an httpOnly cookie, so it is
machine-driven: one call per page load, several tabs plus a poll. It shared `@ThrottleTier('auth')`
— 10/min per IP with a 60-second block. Behind an office NAT or mobile CGNAT, ten automatic
refreshes across the building blocked the whole egress address and logged out every user behind it.

A fifth tier, **`session`** (120/min per IP, no block), now covers `refresh`, `session` and
`logout`. An over-limit refresh returns 429 and the client still holds a valid access token until
it expires, so the cost of being throttled is a retry rather than a logout.

The `session` tier was also added to the e2e harness's expected skip map.

### 16. The migration runner could execute migrations out of order

`assertNoDrift` compared each pending file against the highest sequence seen **so far**. With
`0000` applied, `0001` pending and `0002` applied, the loop reached `0001` while the running
maximum was still 0, so `1 < 0` was false and the file passed. `up()` then executed `0001` **after**
`0002`.

**The repository has a live gap at 0017**, so this is reachable: a hand-written 0017 that landed
after 0018 was applied would have run in the wrong order with no error, and `README.md` claimed a
hard failure that the code did not implement.

The check is now positional — the applied migrations must form a prefix of the file order. That
one rule covers the sandwiched case and its mirror. Two regression tests are named `SANDWICHED`
and `clean prefix` so the behaviour is findable.

The `db:check` warning now explains that the gap is **permanent** (`migration:create` allocates
`max + 1` and never fills a hole, so the file must not be renumbered) and points at the tests.

### 17. Concurrent runners had no mutual exclusion

Per-file transactions prevent a duplicate ledger row but not concurrent DDL. Two pods running
`migration:run` simultaneously — a blue/green deploy, or the `test-e2e` and `test-browser` jobs
against one database — both read the same pending set and both execute it. Concurrent
`CREATE TABLE IF NOT EXISTS` raises a duplicate-key error on `pg_type`; concurrent
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` can deadlock against itself.

`up` and `down` now take a session advisory lock (`pg_advisory_lock`, id `0x48414b41` — "HAKA")
and release it in a `finally`. The lock is session-scoped, so a crashed runner cannot leave it
held.

### 18. A blocked migration hung with no diagnostic

A migration queued behind a long transaction waited for ever. Each migration transaction now sets
`SET LOCAL lock_timeout = '10s'` and `SET LOCAL statement_timeout = '5min'`. `LOCAL` scopes both
to the transaction, so the next migration starts from the defaults.

`migration:status` and `migration:verify` no longer run ledger DDL. They are read-only commands
that were requiring `CREATE` privileges on a production database just to print a table, and two
concurrent `CREATE INDEX IF NOT EXISTS` could race.

### 19. The whole migration history reported the same application date

`applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` backfilled every row written by the old runner with
the moment the new runner first ran, so `migration:status` claimed the entire history was applied
on one day — the exact information an operator reads to learn how long a table has existed.

`backfillLegacyAppliedAt` restores `executed_at` onto rows still carrying the legacy marker, and
checks the column exists first, so it is safe on a database that never had the old runner.

Rollback target ordering used `localeCompare` while `readActiveLedger` ordered with SQL
`ORDER BY` under the database's collation. Two orderings in one file; both now use an explicit
code-point comparison.

### 20. `migration-verify` in CI verified a ledger it had just written

The job spun up a fresh Postgres, applied every migration, then verified the ledger — a tautology
wearing a drift-detection label. Its comment claimed it checked "the migration ledger on the live
database", which was false.

It is renamed **Migration Smoke Test (from scratch)** and now also **re-applies** the chain. That
is a real gate: it proves every migration is self-contained, runs in order on a virgin schema, and
is idempotent — none of which the previous version established. The comment states plainly that it
does not validate any deployed environment.

### 21. `push-schema.ts` was a third, divergent schema

A hand-rolled 237-line bootstrap that created `moderation_logs` — a table that does not exist in
`moderation.schema.ts`, which has `moderation_actions` — and omitted `books`, `payments`,
`rentals`, `contests`, `library` and `badges` entirely. Unreferenced by any script. **Deleted.**

`drizzle-kit` and `dotenv` were imported by `drizzle.config.ts` and declared in **no** package.json
and absent from the lockfile, so `npm run db:studio` failed with `command not found` and never had
worked. Both are now declared as `devDependencies`.

### 22. `hasPermission` was any-of, and `@RequirePermissions` on the wrong base was inert

`required.some(...)` meant `@RequirePermissions(A, B)` granted on **either**. Safe only because no
call site passed two.

The requirement is now data — `{ permissions, mode }` — so the mode cannot be set apart from the
list:

- `@RequireAllPermissions(A, B)` → AND.
- `@RequireAnyPermission(A, B)` → OR, the only way to get any-of, and a name someone must type.
- `@RequirePermissions(A)` → AND by default; unchanged for the eleven existing single-permission
  call sites.

A pre-mode bare array in metadata normalises to `all`, so the old OR behaviour cannot survive as a
legacy path. Anything malformed throws rather than counting as "no requirement".

Separately, only 3 of 24 controllers use `@Secured`, which is the only path that installs
`PermissionsGuard`. On the other 21, `RequirePermissions` metadata was read by nothing.

### 23. `OwnershipGuard` was applied to zero routes

The guard was correctly written — it fails closed in all four branches — and registered in
`CommonModule`, and used by no controller. The IDOR gap it was written for was fully open:
`hasPermission` is a `Set.has`, so `COMMENTS_EDIT_OWN` and `STORIES_EDIT_OWN` are satisfied by
*being a reader or writer*, and nothing verified the addressed resource belonged to the caller.

Now wired on `PATCH`/`DELETE /comments/:id` and on `PATCH`, `/publish`, `/archive`,
`DELETE /stories/:id`, through a resolver per module that goes through that module's repository
interface (Principle #7 — no cross-module database access).

**The books write routes are deliberately not wired.** The `books` table has no owner column —
`books.author` is a `varchar` display name compared against a UUID. Wiring it needs a migration and
a decision about which meaning of "author" survives, or a lookup by mutable free text. Nothing was
half-wired; `src/common/guards/README.md` records it.

Two behaviour changes: a nonexistent or soft-deleted id now answers **403 from the guard** instead
of 404 from the service, and the in-service author checks remain as a second line.

### 24. 500 responses returned internal error messages

`all-exceptions.filter.ts` put `exception.message` in the response body for any non-`HttpException`,
so a Drizzle or `pg` error reached the caller verbatim with SQL fragments, table and column names,
and internal paths. The body is now a generic `Internal server error`; Winston and Sentry still
receive the real message and stack.

### 25. `ENCRYPTION_KEY` accepted a published placeholder in production

`encryption.util.ts` threw only when the variable was **absent**. `.env.example` ships
`ENCRYPTION_KEY=your-encryption-key-here-change-in-production`, which is public, and it was
accepted. That key encrypts and compares password-reset tokens, so a deployment that copied the
example and changed only the two JWT secrets — the only ones the boot error named — ran with a
known reset-token key.

`config/public-secret.ts` now holds the rule once and both `jwt.config.ts` and the new
`encryption.config.ts` consume it (Principle #9). Production refuses the placeholder; development
accepts it so local work and the suite still run.

**On the hardcoded scrypt salt:** it is documented accurately rather than treated as a bug. A KDF
salt defeats precomputation, which buys nothing when the input is a generated high-entropy secret
an attacker must already be able to guess. The constant provides key-domain separation, and making
it configurable would be an unrecoverable data-loss migration, because the salt is not in the
`iv|body|tag` wire format.

### 26. `.env.example` did not match the code

`TIKTOK_CLIENT_ID` was documented; the code reads `TIKTOK_CLIENT_KEY`. An operator configuring the
documented name got an empty `client_key` and TikTok sign-in failed. `FACEBOOK_CLIENT_ID` had the
same problem against `FACEBOOK_APP_ID`.

All five `*_CALLBACK_URL` variables were **absent**, so they fell back to a hardcoded
`http://localhost:3001/...`. In production the OAuth code is sent to localhost and **every**
provider breaks silently.

Twenty-two further read-but-omitted variables were added. The eighteen documented-but-read-by-nothing
variables are now marked as such in the file rather than left to mislead an operator — they
include the whole SMTP block and the S3 credential block, neither of which has a client yet.

`PAYMOB_SANDBOX_*` and `HAKAWI_MIGRATIONS_DIR` are commented out: copying `.env.example` verbatim
was verified to **fail at boot**, because `z.string().min(1).optional()` rejects an empty string.

### 27. The search count query used a different tsvector configuration than the rows query

`search.repository.ts` used `to_tsvector('simple', …)` for the page and `to_tsvector('english', …)`
for the count. `total` therefore did not match the rows returned, so pagination was wrong whenever
stemming changed a match, and the count could not use the `users_search_idx` index that
`0014_create_search_indexes.sql` builds on `'simple'`. Both now share one predicate.

### 28. The Socket.IO adapter read a different set of environment variable names

`redis-io.adapter.ts` read only `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`, with no `VALKEY_*`
fallback, while `ValkeyService` and `docker-compose.yml` use `VALKEY_*`. Under Compose the cache
and the rate limiter connected to the Valkey service while the websocket adapter fell through to
`localhost:6379` unauthenticated — invisible on one instance, silent loss of cross-instance event
fan-out on several.

`valkey.config.ts` now exposes `buildValkeyConnection`, which resolves `VALKEY_*` then `REDIS_*`,
and the adapter takes it through `ConfigService` like everything else.

### 29. Production dependencies carried development tooling

`@playwright/test` and `@playwright/test`'s browser driver were in `dependencies`; so was an
unimported `@nestjs/observe`; `eventemitter2` was declared directly while only
`@nestjs/event-emitter` was used. `@nestjs/testing` sat in the root production tree.

`tsx` **stays** in `dependencies`, deliberately: the production runbook runs `npm ci --omit=dev`
and then `npm run migration:run`, which is `tsx src/db/migrations/migration-runner.ts`. Moving it
would break the documented deploy path. A comment records this.

`next@16.3.5` carried a **critical** remote-code-execution advisory
(`GHSA-vcvr-r3jv-pc5j`, `next/og` `ImageResponse`). Upgraded to `16.3.8`.
`npm audit --omit=dev` now reports **0 vulnerabilities**.

### 30. `migrations/drizzle-draft/` was not ignored

`drizzle.config.ts` writes generated SQL there. It was not in any `.gitignore`, so
`drizzle-kit generate` produced committable noise easily mistaken for real migrations. Now
ignored, with a comment recording that the applied history at `migrations/*.sql` must stay tracked.

## Consequences

**Verification, run after every change above:**

| Gate | Result |
|---|---|
| `npm run typecheck` (backend + frontend) | pass |
| `npm run typecheck --workspace=packages/shared-types` | pass |
| `npm run test` (backend) | **2918 passed / 139 files** |
| `npm run test:run` (frontend) | **340 passed / 21 files** |
| `npx eslint src/ test/ e2e/` | **0 errors**, 1235 warnings |
| `npx prettier --check` (backend) | pass |
| `npm run db:check` | pass, 2 documented warnings |
| `npm audit --omit=dev` | **0 vulnerabilities** |

**Accepted costs, stated rather than hidden:**

- `confirm(are you sure)` is now treated as prose.
- A nonexistent or soft-deleted comment or story id answers 403 from the guard, not 404 from the
  service. 404 was more informative; 403 is what a guard that cannot distinguish them can honestly
  say without leaking existence.
- Two mixed-form IPv6 encodings remain outside the SSRF rules (see decision 9).
- The books write routes remain without ownership enforcement (see decision 23).

**Not attempted.** WAF admin endpoints, a WAF metrics endpoint, a CSP header, an XXE rule, the
`write-through` cache path, the `@CacheWarmTags` caller, MFA, account lockout counters, a session
store, read replicas, backup automation, per-user quotas, a permission-decision audit trail,
consistency-violation detection, compensation mechanisms, a pluggable email transport, alerting
rules, a CHANGELOG, and user-facing documentation. These are tracked in
`docs/01_ARCHITECTURE_PRINCIPLES.md` under *Unbuilt Features These Principles Assume* and in
`docs/roadmap/phases/implementation-roadmap.md`. None of them is a defect in this change set; they
are the standing gap between the principles and the code, which that document is honest about.
