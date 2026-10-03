# Known deviations from the architecture principles

`docs/01_ARCHITECTURE_PRINCIPLES.md` states the rules. This file records where the code **does not
follow one of them**, which is the state the principles themselves cannot describe — a principle that
reads as universally held, and is not, is worse than no principle at all.

Scope: deviations that are visible in `backend/src` today. Each entry names the rule, the sites, why
the deviation is tolerated for now, and what would close it.

---

## Principle #7 — "No direct database access across modules"

**Rule.** Every module integrates through interfaces and contracts, never through another module's
tables. Enforcement as documented: "modules communicate via interfaces only", "no direct database
access across modules".

**Deviation.** Nine non-repository files import `db` directly, and four of them read a table another
module owns:

| site | what it reaches for | why |
|---|---|---|
| `badges/events/badges.event-handler.ts:10-11` | `stories` | resolves a story's author, which `story.published` does not carry |
| `moderation/content-moderation/content-moderation.service.ts:6-9` | `stories`, `comments`, `reports` | **load-bearing.** moderation has to read the content it moderates |
| `moderation/moderation.service.ts:8` | `db` | own module's writes |
| `moderation/admin-dashboard.service.ts:8` | `db` | cross-table report/action aggregation |
| `moderation/events/moderation.event-handler.ts:11-12` | `user_restrictions` | own module |
| `badges/badges.service.ts:10`, `upload/upload.service.ts:10`, `users/users.service.ts:10` | `db` | own module's writes |
| `comments/reactions/comment-reactions.repository.ts:8` | `db` | own module |

**Why tolerated.** The moderation case is genuinely different in kind from the others: a moderation
service that cannot read the stories and comments it moderates cannot moderate them, and wrapping
those reads in a moderation-owned repository would duplicate the stories and comments modules rather
than decouple them. `badges.event-handler` is the same shape as the notifications handler that was just
fixed, and is the honest candidate for the next change.

**What would close it.** Move `badges.event-handler`'s author resolution behind
`IStoriesRepository.findById`, the same fix applied to `notifications.event-handler` in this change
set. The moderation reads are a separate decision and probably belong in an ADR rather than a refactor.

---

## Principle #15 — "Input validation at all boundaries", as enforced by the linter

**Rule.** Input validation at all boundaries. Enforcement includes `tsc --noEmit` and explicit lint
review; `@typescript-eslint/no-floating-promises` is configured.

**Deviation.** `no-floating-promises` is `'warn'`, not `'error'`, and **17 warnings are outstanding**,
all in `.spec.ts` files. A handler that calls a service without `await` or `return` is exactly the shape
this rule exists to catch, and it is not enforced.

This is not hypothetical: while bounding pagination in this change set, a scripted edit dropped the
`return` keyword from four controller handlers, so `findByStory`, `findReplies`, `getReactions` and
`getCommentReactions` began returning `undefined` — and `tsc --noEmit` passed, because a handler that
forgets to return its promise is perfectly well-typed. The tests caught it. The type system did not, and
`no-floating-promises` would have, had it been an error rather than a warning.

**What would close it.** Promote the rule to `'error'` and fix the 17 spec sites. The remaining
warnings are all `expect(...).resolves` / `expect(...).rejects` without `await`, which is a mechanical
change to test files and carries no production risk.

---

## Principle #6 — "Migrations tested on production-like data", as CI exercises it

**Rule.** Migrations are high-risk, requiring careful planning, thorough testing and peer review;
enforcement includes "migrations tested on production-like data" and "rollback strategy for every
migration".

**Deviation.** `migrations/down/` exists for all 20 migrations and `db:check` verifies it
structurally, but CI exercises only the **up** path. No job runs up → down → up, so the 20 rollback
scripts have never been executed by anything automated. `assertReversible` and the ledger are unit
tested against fixtures, not against a real chain.

Two of this change set's migrations were tested against a real PostgreSQL 15 — `0019` across six drift
shapes plus idempotency, down and re-apply; `0020` across its three properties including the
duplicate-refusal path — but that was done by hand and is not a gate, so the next migration gets none
of it automatically.

**What would close it.** Add a `migration-roundtrip` CI job: apply, roll back to zero with
`--allow-data-loss`, re-apply, verify checksums. It roughly doubles the Postgres cost of the existing
`migration-verify` job, which is why it is a decision rather than an omission.

---

## Principle #9 — "Single source of truth", and the dead-letter queue

**Rule.** Every piece of data has exactly one authoritative source.

**Status: resolved in this change set.** The dead-letter queue had no drain: `retryDLQ` deleted a
now-valid entry and returned `true` **without re-emitting it**, so a schema-validation failure was
written to Valkey and then lost at the 7-day TTL — and its spec, "should retry and delete from DLQ if
valid", asserted the loss. `EventValidatorService.replayDeadLettered` now re-validates and re-delivers,
and `GET /events/dlq` + `POST /events/dlq/:id/replay` expose it to a super administrator.

---

## Principles #1, #2, #3 — held, with two accepted costs

These three are enforced mechanically and currently hold: `any` and `as any` are `error` in ESLint and
`tsc --noEmit` passes; `no-console` is `error` and there is no `console` in `backend/src`; ids are
strings throughout.

Two costs are accepted rather than eliminated:

- **`strictPropertyInitialization: false`** in `backend/tsconfig.json`. Standard for Nest's
  constructor-injected properties, which are assigned by the container rather than the declaration.
  `skipLibCheck: true` is the usual companion and carries no real risk.
- **`strict: false` is NOT set anywhere**, and neither is `any` suppressed by a comment. Worth stating
  because it is the sort of thing that erodes silently.

---

## What is *not* a deviation

Recorded so the next reader does not re-investigate it:

- **`@nestjs/typeorm` is recommended by `docs/module-boundaries/dependency-rules.md` and the project uses
  Drizzle.** That document describes a system that does not exist: it references a "Core Module", an
  "Interactions Module" and `@core/*` path aliases, none of which are in the codebase. It is
  documentation debt, not a code deviation, and the honest fix is to rewrite the document.
- **`WAF_BLOCKED_COUNTRIES` is parsed and deliberately inert.** This follows Principle #15's spirit
  rather than violating it: there is no GeoIP source, and enforcing on a client-supplied country header
  would be forgeable — a security control that reads as enforced and is not. It is pinned by a test that
  asserts the field is named `reserved*` and that no key named `blockedCountries` exists.
- **`body-size-limit` is detection, not prevention.** Defence in depth, not a gap: `requestSizeLimit`
  and the two parser `limit` options run first and abort the stream. Both the rule and the middleware
  say so in their own comments.