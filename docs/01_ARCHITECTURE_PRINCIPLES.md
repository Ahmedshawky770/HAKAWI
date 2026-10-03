# Architecture Principles
## حكاوي (Hakawi) - Core Principles

> **Latest change-set review.** A 488-file uncommitted change set was audited line by line and
> hardened. Every fix, and the reasoning behind each one — including the trade-offs that were
> accepted rather than hidden — is recorded in
> [`docs/adr/005-security-and-correctness-hardening.md`](adr/005-security-and-correctness-hardening.md).
> The verdict tables below reflect that work. Verified after it: backend 2918 tests, frontend 340,
> `tsc --noEmit` clean across three workspaces, 0 lint errors, `prettier --check` clean,
> `npm audit --omit=dev` at 0 vulnerabilities.

---

## Principle #1: Zero `any` / `as any` Policy

**Statement:**
TypeScript's `any` type and `as any` casts are strictly banned from my codebase. If the compiler cannot verify a type, I do not ship it. Type safety is the first line of defense against runtime errors, and bypassing it is technical debt in disguise. Every type must be explicit, every cast must be justified.

**Rationale:**
- `any` bypasses TypeScript's type system
- Runtime errors that could be caught at compile time
- Technical debt that compounds over time
- Makes refactoring dangerous

**Enforcement:**
- ESLint rule: `@typescript-eslint/no-explicit-any` (error)
- CI check: `tsc --noEmit` must pass
- Code review: explicit check for `any` usage

**Exceptions:**
- Third-party library types that are untyped (must be wrapped)
- Dynamic JSON parsing (must be validated with Zod first)

---

## Principle #2: Logger Over `console`

**Statement:**
I never use `console.log` in production code. Every log entry goes through a structured Logger with proper log levels, timestamps, correlation IDs, and contextual metadata. Debugging a production issue without structured logging is like searching for a needle in a haystack — in the dark. Logs are not noise; they are the system's voice.

**Rationale:**
- `console.log` lacks structure and context
- No log levels (debug, info, warn, error)
- No correlation IDs for tracing requests
- No structured data for analysis

**Enforcement:**
- ESLint rule: `no-console` (error)
- Winston/Pino logger with structured output
- Correlation IDs injected via middleware
- Log levels: debug, info, warn, error

**Example:**
```typescript
// ❌ BAD
console.log('User created', user);

// ✅ GOOD
logger.info('User created', { userId: user.id, email: user.email, correlationId });
```

---

## Principle #3: IDs as Strings

**Statement:**
All entity identifiers are stored, passed, and serialized as strings — never as numbers. This prevents precision loss with large integer IDs, simplifies serialization across system boundaries, and eliminates subtle bugs that arise when numeric IDs overflow or lose precision in JavaScript. Consistency in ID representation is non-negotiable.

**Rationale:**
- UUIDs are strings by nature
- JavaScript numbers lose precision beyond 2^53
- String IDs serialize safely to JSON
- Consistent across API boundaries

**Enforcement:**
- All database schemas use `uuid` or `text` for IDs
- TypeScript types use `string` for all IDs
- API contracts use `string` for all IDs
- No `number` types for identifiers

**Example:**
```typescript
// ❌ BAD
type UserId = number;

// ✅ GOOD
type UserId = string;
```

---

## Principle #4: Document Problems and Solutions

**Statement:**
Every bug I encounter, every architectural decision I make, every workaround I implement — I document it. Not for others, but for myself six months from now. A problem solved but not documented is a problem waiting to be solved again. Documentation is not bureaucracy; it is the memory of the project.

**Rationale:**
- Memory fades, documentation persists
- Onboarding new team members
- Troubleshooting production issues
- Learning from past mistakes

**Enforcement:**
- Every bug fix includes a documentation update
- Every ADR (Architecture Decision Record) is written
- Runbooks for common operational tasks
- README files for every module

**Documentation Types:**
- ADRs: Architecture decisions
- Runbooks: Operational procedures
- README: Module overview
- CHANGELOG: Version history

---

## Principle #5: Architecture Before Code

**Statement:**
I never write a single line of code before drawing the architecture. Every project begins with diagrams: system components, data flow, module boundaries, dependency directions, and integration points. Coding without architecture is building a house without a blueprint — it might stand for a while, but it will collapse the moment you need to extend it. Architecture is not overhead; it is insurance.

**Rationale:**
- Prevents costly refactoring later
- Aligns team on shared vision
- Identifies risks early
- Enables parallel development

**Enforcement:**
- No feature implementation without architecture review
- C4 diagrams for every module
- ADRs for every significant decision
- Architecture review checklist

**Deliverables:**
- System context diagram
- Container diagram
- Component diagram
- Data flow diagram
- Module dependency graph

---

## Principle #6: Minimize Database Migrations

**Statement:**
I treat database migrations as high-risk operations that require careful planning, thorough testing, and peer review before execution. I design schemas to be flexible enough to minimize the need for future migrations, because every migration is a potential point of failure in production. A schema change that breaks data integrity is worse than a feature that ships late.

**Rationale:**
- Migrations are risky in production
- Data loss is irreversible
- Downtime for migrations is costly
- Schema flexibility reduces future migrations

**Enforcement:**
- All migrations reviewed by 2+ developers
- Migrations tested on production-like data
- Rollback strategy for every migration
- Schema designed for extensibility

**Strategies:**
- Use JSONB for flexible data
- Add nullable columns first, backfill, then make required
- Avoid breaking changes (rename, don't delete)
- Use UUIDs for forward-compatible references

---

## Principle #7: Loose Coupling Between Modules

**Statement:**
Every module in my system integrates with others through well-defined interfaces and contracts, never through direct internal dependencies. If I need to swap a component, I should be able to do so without touching the rest of the system. Tight coupling is the silent killer of maintainability — it turns a small change into a system-wide rewrite.

**Rationale:**
- Tight coupling makes changes expensive
- Hard to test in isolation
- Difficult to deploy independently
- Risk of cascade failures

**Enforcement:**
- Modules communicate via interfaces only
- No direct database access across modules
- Dependency injection for all dependencies
- Event-driven communication for loose coupling

**Patterns:**
- Repository pattern for data access
- Service layer for business logic
- Event emitter for cross-module communication
- Interface segregation

---

## Principle #8: Open for Extension, Closed for Modification

**Statement:**
I design my systems so that new features can be added without modifying existing, working code. This is not an abstract OOP principle — it is a survival strategy. Every time you modify working code, you risk breaking something you did not intend to. Extension through interfaces, strategies, and plugins is always safer than modification of core logic.

**Rationale:**
- Modifying working code introduces risk
- Regression bugs are expensive
- Features should be additive, not invasive
- System stability is paramount

**Enforcement:**
- New features via new modules/classes
- Extension points via interfaces
- Strategy pattern for variable behavior
- Plugin architecture for optional features

**Patterns:**
- Strategy pattern
- Decorator pattern
- Observer pattern (events)
- Plugin architecture

---

## Principle #9: Single Source of Truth (SSOT)

**Statement:**
Every piece of data in my system has exactly one authoritative source. No duplicated state, no conflicting caches, no ambiguity about which version is correct. If two systems disagree about the data, one of them is wrong — and I design so that there is only one place to look. SSOT is not a preference; it is a requirement for sanity.

**Rationale:**
- Data inconsistency causes bugs
- Duplicate state requires synchronization
- Synchronization is complex and error-prone
- Debugging inconsistent data is difficult

**Enforcement:**
- One authoritative source per entity
- Caches are invalidated on updates
- Event-driven updates for derived data
- No direct cross-module data access

**Examples:**
- User data: PostgreSQL only — the authoritative store
- Story content: **PostgreSQL is authoritative**; Sanity is a downstream mirror synced by
  `sanity-sync.event-handler.ts`. (This line previously said "Sanity only", which was backwards.)
- User preferences: PostgreSQL only (`notification_preferences`)
- Analytics: Derived from primary sources, computed at read time

---

## Principle #10: Unified Typing Files

**Statement:**
All TypeScript types, interfaces, and enums live in dedicated, centralized typing files — not scattered across components or modules. This ensures consistency, prevents duplication, eliminates type conflicts, and makes refactoring predictable. One source of truth for types, just as there is one source of truth for data.

**Rationale:**
- Scattered types cause duplication
- Type conflicts are hard to resolve
- Refactoring is unpredictable
- IDE autocomplete is less effective

**Enforcement:**
- All types in `src/types/` or module-level `types.ts`
- No inline type definitions in components
- Shared types in `shared/types/`
- Barrel exports for clean imports

**Structure:**
```
src/
├── types/
│   ├── user.types.ts
│   ├── story.types.ts
│   ├── book.types.ts
│   └── index.ts
└── modules/
    ├── users/
    │   └── types.ts  # Module-specific types
    └── stories/
        └── types.ts  # Module-specific types
```

---

## Principle #11: Valkey (Docker) as Cache Layer

**Statement:**
I use Valkey (a Redis-compatible in-memory store) running in Docker as my caching layer. It is fast, lightweight, predictable, and easy to orchestrate. Caching is not an optimization I add later — it is part of the architecture from day one, with clear invalidation strategies, TTL policies, and fallback mechanisms. A cache without an invalidation strategy is a bug factory.

**Rationale:**
- Caching is critical for performance
- Valkey is Redis-compatible and lightweight
- Docker makes it easy to orchestrate
- Invalidation strategy prevents stale data

**Enforcement:**
- Valkey running in Docker Compose
- TTL policies for all cached data
- Tag-based invalidation
- Cache hit rate monitoring

**Strategies:**
- Cache-aside pattern
- Write-through for critical data
- TTL based on data volatility
- Cache warming for frequently accessed data

---

## Principle #12: Reduce Synchronization, Unify Source, Prevent Cascade Failures

**Statement:**
I minimize the number of synchronized data sources in my systems. Every additional synchronization point is a potential point of failure and a source of inconsistency. By unifying the data source and reducing dependencies between components, I prevent cascade failures where one broken service drags the entire system down. Fewer moving parts means fewer things that can break.

**Rationale:**
- Synchronization is complex and error-prone
- More sync points = more failure points
- Cascade failures are catastrophic
- Single source of truth is simpler

**Enforcement:**
- Minimal sync between systems
- One authoritative source per entity
- Event-driven updates for derived data
- Circuit breakers for external dependencies

**Examples:**
- Users: PostgreSQL only (no sync to Sanity)
- Stories: **PostgreSQL authoritative, Sanity a read-only mirror.** (This line previously said
  "Sanity only (read-only mirror in PostgreSQL)", which had the direction of the mirror backwards.)
- Notifications: PostgreSQL only
- Analytics: Derived from primary sources

---

## Principle #13: Automate Massive Modifications (With Awareness)

**Statement:**
When I need to make a repetitive change across 40 or more files, I do not do it manually. I write a script, execute it in the terminal, and then review every change carefully. However, I treat this as a rescue protocol, not a standard workflow. Reaching this point means the abstraction was insufficient — and I commit to improving the architecture afterward to prevent the repetition from ever happening again.

**Rationale:**
- Manual changes are error-prone
- Repetition indicates poor abstraction
- Automation prevents human error
- But reaching this point is a code smell

**Enforcement:**
- Write scripts for bulk operations
- Review all changes after automation
- Refactor to prevent future repetition
- Document the script and its purpose

**Tools:**
- `jscodeshift` for code transformations
- `sed`/`awk` for simple replacements
- Custom Node.js scripts for complex changes

---

## Principle #14: AP as the Default Choice

**Statement:**
In distributed systems, I default to Availability and Partition Tolerance. I compensate for the absence of strong consistency by optimizing response speed (Low Latency), ensuring users perceive the system as fast and responsive. Strong Consistency (CP) is reserved exclusively for 'critical islands' — payments, inventory, and authentication — where inconsistency means financial loss or security breaches. For everything else, availability wins.

**Rationale:**
- Users prefer fast over consistent
- Network partitions are inevitable
- Strong consistency is expensive
- Critical data needs consistency, not everything

**Enforcement:**
- Repository pattern for data access
- Eventual consistency for non-critical data
- Strong consistency for payments, auth, inventory
- Optimistic locking for conflicts

**Consistency Matrix:**
| Data Type | Consistency | Reason |
|-----------|-------------|--------|
| Payments | Strong | Financial accuracy |
| Auth | Strong | Security |
| Inventory | Strong | Stock accuracy |
| Stories | Eventual | User-generated content |
| Notifications | Eventual | Non-critical |
| Analytics | Eventual | Derived data |

---

## Principle #15: Proactive Defense First

**Statement:**
I use Rate Limiting as the first line of defense against system overload — before resorting to reactive mechanisms like Circuit Breakers, Retry patterns, or Fallback strategies. The best way to handle a system failure is to prevent it from happening in the first place. Reacting to overload is a backup plan; preventing overload is the primary strategy. Defense in depth starts with prevention.

**Rationale:**
- Prevention is cheaper than cure
- Rate limiting is cheap to implement
- Circuit breakers are reactive, not preventive
- Overload damages system reputation

**Enforcement:**
- Rate limiting on all public APIs
- WAF for malicious traffic
- Input validation at all boundaries
- Resource quotas per user/tenant

**Layers:**
1. Rate limiting (first line)
2. WAF (second line)
3. Input validation (third line)
4. Circuit breakers (last resort)

---

## Principle #16: Smart Hybrid Consistency

**Statement:**
No large system is purely consistent or purely available — every real-world system is inherently Hybrid. I classify data into three categories and apply the appropriate consistency model to each: Strong Consistency for critical data (payments, direct chat messages, inventory counts), Eventual Consistency for non-critical data (feeds, notifications, analytics), and Causal Consistency for causally related data (comments and their replies, threaded discussions). Choosing the right consistency model for the right data is what separates a system that works from a system that works at scale.

**Rationale:**
- One size does not fit all
- Strong consistency is expensive
- Eventual consistency is fast
- Causal consistency maintains order

**Enforcement:**
- Data classification matrix
- Consistency model per data type
- Monitoring for consistency violations
- Compensation mechanisms for inconsistencies

**Consistency Types:**
| Type | Use Case | Example |
|------|----------|---------|
| Strong | Critical data | Payments, auth |
| Eventual | Non-critical | Feeds, notifications |
| Causal | Related data | Comments, threads |

---

## Principle #17: Warning Against Automating Massive Linting

**Statement:**
Running an automated lint-fix script across more than 100 files is not a fix — it is a potential corruption of the entire project. Automated linting tools, when applied at scale, often break code rather than repair it, introducing subtle regressions that are difficult to detect. Such operations demand careful manual review or, in many cases, a fundamental refactoring of the codebase instead of blind reliance on automation. Automation is a tool, not a substitute for understanding.

**Rationale:**
- Automated lint-fix can break code
- Subtle regressions are hard to detect
- Understanding is better than automation
- Refactoring is better than patching

**Enforcement:**
- No `lint --fix` on >50 files without manual review
- Prefer incremental fixes
- Refactor to prevent accumulation
- Code review for all bulk changes

**Better Approach:**
- Fix issues as they arise
- Refactor to prevent recurrence
- Use type-safe patterns
- Code review for all changes

---

## 📋 Principles Summary

| # | Principle | Category | Enforcement | Verdict |
|---|-----------|----------|-------------|---------|
| 1 | Zero `any` / `as any` | Code Quality | ESLint + CI | ✅ **ENFORCED** |
| 2 | Logger over console | Code Quality | ESLint + CI | ⚠️ **PARTIAL** |
| 3 | IDs as Strings | Code Quality | TypeScript + CI | ✅ **ENFORCED** |
| 4 | Document Problems | Documentation | Process | 🔄 **IN PROGRESS** |
| 5 | Architecture Before Code | Architecture | Process | 🔄 **IN PROGRESS** |
| 6 | Minimize Migrations | Architecture | Process | ✅ **ENFORCED** |
| 7 | Loose Coupling | Architecture | Code Review | ⚠️ **PARTIAL** |
| 8 | Open/Closed Principle | Architecture | Code Review | ⚠️ **PARTIAL** |
| 9 | Single Source of Truth | Architecture | Architecture | ✅ **ENFORCED** |
| 10 | Unified Typing Files | Code Quality | Process | ✅ **ENFORCED** |
| 11 | Valkey as Cache | Infrastructure | Docker + Config | ⚠️ **PARTIAL** |
| 12 | Reduce Synchronization | Architecture | Architecture | 🔄 **PARTIAL** |
| 13 | Automate Modifications | Process | Process | 🔄 **PROCESS ONLY** |
| 14 | AP as Default | Distributed Systems | Architecture | ⚠️ **PARTIAL** |
| 15 | Proactive Defense | Security | WAF + Rate Limiting | ⚠️ **PARTIAL** |
| 16 | Smart Hybrid Consistency | Distributed Systems | Architecture | ⚠️ **PARTIAL** |
| 17 | Warning Against Massive Linting | Process | Process | ✅ **OBSERVED** |

**Legend:** ✅ ENFORCED — the mechanism exists and CI fails without it · ⚠️ PARTIAL — some clauses
hold, others do not · 🔄 IN PROGRESS — a stated goal with partial delivery · ✅ OBSERVED — the
practice was followed, no automated gate.

---

## 🔍 Per-Principle Verdict Detail

Each verdict below was checked against the code on 2026-09-30.

### #1 Zero `any` — ✅ ENFORCED
`@typescript-eslint/no-explicit-any: 'error'` in `backend/.eslintrc.cjs`, and `npx eslint src/ test/
e2e/` reports **0 errors**. The repo is 100% `no-unsafe-assignment`/… *warn*-level, not error, so
unsafe assignments are visible but do not fail CI. `tsc --noEmit` is clean across backend, frontend,
shared-types and the e2e harness as four separate CI steps.

### #2 Logger over `console` — ⚠️ PARTIAL
- ✅ `no-console: 'error'` in `backend/.eslintrc.cjs`, tightened to `'error'` for `src/**`
- ✅ Winston is the only logger in `src/`; correlation IDs flow from the WAF middleware into every
  error body and log line
- ⚠️ `winston.createLogger` is called **with no `level`**, so winston defaults to `'info'` and the
  service's `debug()` and `verbose()` methods are **permanently discarded** — the two methods it
  exposes can never emit
- ✅ The 500 response body is now a generic `Internal server error`. `all-exceptions.filter.ts` used
  to return `exception.message` for any non-`HttpException`, so a Drizzle or `pg` error reached the
  caller verbatim with SQL fragments, table and column names, and internal paths. Winston and Sentry
  still receive the real message and stack
- ⚠️ The frontend ESLint config is stock `eslint-config-next` with **no `no-console` rule**

### #3 IDs as Strings — ✅ ENFORCED
Every `pgTable` in `backend/src/db/schema/*.ts` uses `uuid()` primary keys. `@hakawi/shared-types`
declares every ID as `string`. `docs/03_ids_as_strings.md` matches the code.

### #4 Document Problems — 🔄 IN PROGRESS
- ✅ 24 ADRs / decision records, 17 principle documents, and a full deployment/testing/roadmap set
- ✅ `docs/` reconciled against the code on 2026-09-30
- ⚠️ `docs/module-boundaries/**` contains four near-duplicate files
  (`contracts.md` + `contracts/module-contracts.md`, `dependency-rules.md` +
  `dependencies/dependency-rules.md`, `interfaces.md` + `interfaces/shared-interfaces.md`) with no
  statement of which is canonical
- ⛔ No user-facing documentation
- ⛔ No CHANGELOG, despite Principle #4 listing one as a documentation type

### #5 Architecture Before Code — 🔄 IN PROGRESS
- ✅ C4 model (`c4-model/`), system architecture, data architecture, module boundaries, and API
  contract documents all exist and were reconciled
- ⚠️ Several documents previously described systems that did not exist. The C4 container diagram is
  now accurate; the module-boundaries set still needs the same audit
- ⚠️ "No feature implementation without architecture review" and "architecture review checklist" are
  process claims with no artifact behind them

### #6 Minimize Migrations — ✅ ENFORCED
The strongest principle in the set, and now mechanised rather than aspirational:
- ✅ 18 numbered `.sql` files at repo-root `migrations/` are the single source of truth
- ✅ `drizzle-kit up:pg` (a schema push that discarded history) is **gone**
- ✅ Every migration is **transaction-wrapped** (`migration-runner.ts:218,247`)
- ✅ A **sha256 content-checksum ledger** makes editing an applied file a hard error
  (`backend/src/db/migrations/migration-runner.ts:296`)
- ✅ Rollback is driven by sidecars with **machine-read reversibility headers**, classified
  `reversible` / `data-loss` (needs `--allow-data-loss`) / `irreversible` (never runs)
- ✅ `0001_create_stories_tables` is deliberately **irreversible** because it owns the shared
  `uuid-ossp` extension — dropping it would cascade into every `uuid_generate_v4()` default
- ✅ `npm run db:check` lints the chain statically with no database, and runs as a **hard CI gate**
- ✅ An **advisory lock** (`pg_advisory_lock`) serialises `up` and `down` across processes. Two pods
  running `migration:run` concurrently — a blue/green deploy, or two CI jobs against one database —
  previously both read the same pending set and both executed it
- ✅ `SET LOCAL lock_timeout` / `statement_timeout` per migration, so a migration blocked behind a
  long transaction fails with a diagnostic instead of hanging a deploy step for ever
- ✅ The applied migrations must form a **prefix** of the file order. The old check missed the
  sandwiched case (0000 applied, 0001 pending, 0002 applied → 0001 ran *after* 0002), and the
  repository has a live sequence gap at 0017, so it was reachable
- ⚠️ "All migrations reviewed by 2+ developers" is a process claim with no tooling behind it
- ⛔ "Backup before migrations" has no automation behind it — no backup job exists
- ✅ `backend/push-schema.ts` — a third, divergent hand-rolled bootstrap creating a table that does
  not exist in the Drizzle schema — was **deleted**. `drizzle-kit` and `dotenv` were imported by
  `drizzle.config.ts` and declared nowhere, so `db:studio` had never worked; both are now declared

### #7 Loose Coupling — ⚠️ PARTIAL
- ✅ **Event-driven communication is real:** EventEmitter2 with 16 event modules, 19 per-module
  handlers, a schema registry, a validator, and a **dead letter queue**
- ✅ The circuit breaker / retry / timeout / fallback primitives are **wired**, not dead code:
  `CircuitBreakerService` is injected into `auth.service.ts` and `sanity.service.ts`;
  `ResilientHttpClient` fronts `PaymobClient`
- ✅ Dependency injection throughout; the guards are injectable or explicit factories
- ⚠️ **"No direct database access across modules" is not enforced.** Services import
  `src/db/index.ts` directly, and `messages.service.ts`, `stories.service.ts` and others hold their
  own Drizzle queries rather than going through a module-owned repository
- ⚠️ The `Repository` pattern is applied inconsistently: 17 repository files exist under
  `src/modules/**/repositories/`, but several services bypass them
- ✅ `OwnershipGuard` is now wired on `PATCH`/`DELETE /comments/:id` and on `PATCH`, `/publish`,
  `/archive`, `DELETE /stories/:id`, through a per-module resolver that goes through that module's
  repository interface. `PATCH`/`DELETE /books/:id` are **still unprotected**, because the `books`
  table has no owner column — `books.author` is a `varchar` display name compared against a UUID.
  That needs a migration and a decision, not a wiring change; it is recorded in
  `backend/src/common/guards/README.md` rather than half-solved.

### #8 Open/Closed — ⚠️ PARTIAL
- ✅ Extension points exist: the `PaymobClient` sits behind `ResilientHttpClient`; the throttler
  storage is an interface with a Valkey implementation; the 34 WAF rules are a **data-driven table**
  where a new rule is a new entry, not a new branch
- ✅ The `Secured` decorator composes guards without editing them; the `@Cacheable` /
  `@CacheInvalidateTags` decorators add caching without touching service code
- ⚠️ "Plugin architecture for optional features" does not exist. The email delivery path is
  configured but has no pluggable transport, and no optional feature is loaded dynamically

### #9 Single Source of Truth — ✅ ENFORCED
- ✅ **Roles:** `ACCOUNT_TYPES` / `ADMIN_ROLES` in `@hakawi/shared-types`, re-exported by
  `backend/src/common/constants/roles.ts`. There is no second list.
- ✅ **Permissions:** `backend/src/common/permissions/permissions.ts` — 51 permissions,
  `PERMISSIONS_BY_ACCOUNT_TYPE` and `PERMISSIONS_BY_ROLE`
- ✅ **Types:** `@hakawi/shared-types` is compiled and consumed by both backend and frontend, with
  `Exact<A,B>` compile-time drift assertions
- ✅ **Schema:** the SQL files are the source; Drizzle is a query/type layer
- ✅ **Cache invalidation:** tagged invalidation on every write; `CacheMetrics` at
  `GET /api/v1/metrics/cache`
- ⚠️ "Story content: Sanity only" is **not** how it works. PostgreSQL is authoritative and Sanity
  syncs from it. The claim in this document was backwards.
- ✅ **Valkey connection:** `config/valkey.config.ts` exports `buildValkeyConnection`, resolving
  `VALKEY_*` then `REDIS_*`. The cache and the Socket.IO adapter previously read *different*
  variable names, so a Docker Compose deployment pointed websocket fan-out at `localhost:6379`
  while the cache connected correctly — invisible on one instance, silent fan-out loss on several.
- ✅ **"a value published in this repo is not a secret":** `config/public-secret.ts` holds the rule
  once; `jwt.config.ts` and `encryption.config.ts` both consume it. `ENCRYPTION_KEY` previously
  accepted the `.env.example` placeholder in production, which meant a known password-reset key.

### #10 Unified Typing Files — ✅ ENFORCED
- ✅ `packages/shared-types/src/` holds 12 domain files with `as const` enum arrays,
  `Paginated<T>` / `NamedPage<Key,T>` envelopes, and `Exact<A,B>` drift assertions
- ✅ The backend imports the package; the frontend consumes the **compiled** output
- ✅ `frontend/src/lib/schemas.ts` holds ~50 runtime Zod schemas, and `lib/api.ts` has **no blind
  `as` casts**
- ✅ `AuthorSummary.name` is `string | null`; `StoryRecord.authorName` is required and nullable
- ⛔ `UnpagedNamedList` was **deleted**; any doc still referencing it is wrong
- ✅ `common/types/permission-requirement.types.ts` holds the permission-requirement mode, so the
  AND/OR choice travels with the permission list as data and cannot be set apart from it

### #11 Valkey as Cache Layer — ⚠️ PARTIAL

**The four clauses the principle originally named are now all satisfied** — this is the principle
that improved the most. But the enforcement list also contains two bullets that are not built, so
the honest verdict is PARTIAL, not COMPLIANT.

| Clause | Status | Evidence |
|---|---|---|
| **Valkey running in Docker Compose** | ✅ | `docker-compose.yml`; `backend/src/config/valkey.config.ts` |
| **TTL policies for all cached data** | ✅ | `STORY_CACHE_TTL_SECONDS = 600`, `BOOK_CACHE_TTL_SECONDS = 600`, `PAYMENT_CACHE_TTL_SECONDS = 300`, `DEFAULT_CACHE_TTL_SECONDS = 3600` |
| **Tag-based invalidation** | ✅ | `@CacheInvalidateTags` with tag sets `stories`, `books`, `payments`; fired on every write |
| **Cache hit rate monitoring** | ✅ | `CacheMetrics` at `GET /api/v1/metrics/cache` → `{ hits, misses, hitRate }` |
| **Cache-aside** | ✅ | `cache.interceptor.ts` |
| **Write-through for critical data** | ⛔ | Not implemented. The write path **invalidates** rather than writing through |
| **Cache warming** | ⛔ | `@CacheWarmTags` exists as a decorator but **has no caller** |

- ✅ Cache-aside is the implemented pattern (`cache.interceptor.ts`)
- ⚠️ **"Write-through for critical data" is not implemented**; the write path invalidates rather
  than writes through
- ⚠️ **"Cache warming" has a `@CacheWarmTags` decorator but no caller**
- ⚠️ TTLs are **compile-time constants, not configuration.** The `CACHE_TTL_*` environment
  variables in `backend/.env.example` are read by nothing
- ✅ Fail-open when Valkey is unreachable, which keeps availability but means an outage silently
  removes protection

### #12 Reduce Synchronization / Prevent Cascade Failures — 🔄 PARTIAL

**The resilience primitives are no longer dead code** — that was the previous verdict. They are now
wired into the two places that call external services:

| Primitive | Status | Wired into |
|---|---|---|
| **Circuit breaker** | ✅ | `backend/src/modules/auth/auth.service.ts:59`, `stories/sanity/sanity.service.ts` |
| **Retry with backoff** | ✅ | `ResilientHttpClient` → `PaymobClient` |
| **Timeout** | ✅ | `TimeoutService`, `DEFAULT_OPERATION_TIMEOUT_MS` |
| **Fallback** | ✅ | `FallbackService` |

- ✅ Paymob fails cleanly: 503 with the local payment marked `failed`, instead of fabricating a
  checkout URL
- ✅ "One authoritative source per entity" holds — the SSOT inventory in #9
- ✅ "Event-driven updates for derived data" — the DLQ means a failed handler no longer loses the event
- ⚠️ **Circuit breaker is not applied to Sanity's write path or to S3**, only to the two services
  above
- ⛔ **No circuit breaker is applied to PostgreSQL or Valkey**, so the two hard dependencies still
  fail open rather than degrading
- ⛔ The two-line example "Users: PostgreSQL only (no sync to Sanity)" is **wrong for Stories**, and
  "Stories: Sanity only (read-only mirror in PostgreSQL)" is **backwards** — PostgreSQL is
  authoritative and Sanity is the downstream mirror

### #13 Automate Massive Modifications — 🔄 PROCESS ONLY
- ✅ `backend/scripts/generate-migration.ts` scaffolds a migration plus its down sidecar
- ✅ `backend/scripts/check-migrations.ts` statically lints the whole chain
- ✅ `backend/scripts/print-coverage-summary.mjs` renders the coverage gate for CI
- ✅ `vitest.swc-plugin.ts` centralises the SWC transform that would otherwise need repeating
- ⛔ `jscodeshift` is not a dependency; the "Tools" list is aspirational
- ⛔ "Review all changes after automation" and "refactor to prevent future repetition" are process
  claims with no tooling

### #14 AP as Default — ⚠️ PARTIAL
The consistency **matrix** in this document is stated correctly and
`docs/consistency-matrix.md` has been reconciled against the schema. What is missing is the
enforcement the "Enforcement" section promises.

- ✅ The classification exists and is documented per data type
- ✅ Notifications, story → Sanity sync, and analytics reads are genuinely eventual
- ⛔ **"Strong consistency for payments, auth, inventory" is not implemented as a mechanism.** There
  is no `SELECT … FOR UPDATE`, no version column, and no optimistic-locking check anywhere in
  `backend/src`. The only concurrency control on the money path is a `uniqueIndex` on
  `payments.paymob_transaction_id` — which prevents duplicate *rows*, not duplicate *charges*
- ⛔ **Inventory does not exist** as an entity. There is no stock count to be consistent about
- ⚠️ Availability-over-consistency is a real consequence: the throttler storage **fails open** and
  the cache fails open, so an overload or an outage degrades protection rather than refusing
  service. That is the AP choice, made deliberately

### #15 Proactive Defense First — ⚠️ PARTIAL
Rate limiting is now genuinely the first line, and the WAF's own layers are still incomplete.

**Layer 1 — Rate limiting: ✅ now real, was previously claimed only**
- ✅ Five tiers in `backend/src/config/throttle.config.ts`: `default` 30/min per user,
  `auth` 10/min per IP, `session` 120/min per IP, `upload` 5/min per user, `search` 50/min per user
- ✅ The `session` tier exists because refresh is **machine** traffic. It shared the `auth` budget
  of 10/min per IP, so ten automatic refreshes across one office NAT or mobile CGNAT blocked the
  whole egress address for a minute and logged out every user behind it
- ✅ `default` is 30/min, not 100. It is the fallback for every undecorated route, and its
  `tracker: 'user'` silently degrades to per-IP because `JwtAuthGuard` is not an `APP_GUARD` and
  `request.user` is unset when `ThrottlerGuard` runs. A per-IP ceiling has to survive a scraper
- ✅ Applied per route via `@ThrottleTier(...)`
- ✅ Backed by a **real `ValkeyThrottlerStorage`** — previously in-memory per instance, which made
  the effective limit `limit × instance_count` behind a load balancer and contradicted
  `docs/11_decisions.md`
- ✅ Real 429 tests exist
- ⚠️ `THROTTLE_TRUST_PROXY` defaults to `false`. Behind a reverse proxy without it, per-IP
  throttling and IP blocking key on the **proxy's** address
- ⛔ The WAF's own known limits are now written down in `backend/src/common/waf/README.md` under
  *Known limits, recorded rather than hidden* — including the two mixed-form IPv6 encodings the
  SSRF rules cannot match, and the fact that the body-size rule **detects** rather than prevents

**Layer 2 — WAF: ⚠️ partial**
- ✅ 35 typed rules in 8 layers. Four of them (`xss-script-function`, `command-chain-separator`,
  `sql-time-based`, `ldap-filter-injection`) used to match ordinary prose — `"steps & id check"`,
  `"the book made me sleep( a lot"`, `"(uid=*) group"` — and at the default `WAF_BLOCK_SEVERITY=high`
  that was a one-hour IP block for writing a technical sentence. The **patterns were tightened,
  not the severities lowered**, because downgrading would have traded a false positive for a silent
  loss of detection. Verified: 0 prose false positives, 0 missed attacks
- ✅ `ssrf-encoded-host` was added for host shapes a dotted-decimal pattern cannot see
  (`http://2130706433/`, `http://0x7f000001/`, `http://127.1/`)
- ✅ Valkey-backed IP blocklist with temp/permanent blocks and TTL auto-unblock
- ✅ `X-RateLimit-*` and `X-Waf-*` response headers
- ✅ The catastrophic rule that 403'd ordinary Arabic and English prose is **gone**
- ⛔ **Admin operations endpoints do not exist.** `GET /admin/waf/blocked-ips`,
  `POST /admin/waf/unblock-ip`, `POST /admin/waf/clear-counters` and `POST /admin/waf/clear-blocks`
  are all absent. An operator blocked by the WAF has no supported way out except direct Valkey
  manipulation
- ⛔ **No WAF metrics endpoint.** No counters, no dashboards, no alerting
- ⛔ **No XML injection (XXE) rule**
- ⛔ **No `Content-Security-Policy`** is emitted

**Layer 3 — Input validation: ⚠️ partial**
- ✅ A global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`
- ✅ Zod on **every** Paymob response
- ⚠️ Several `dto/` files were Zod schemas the pipe silently skipped; fixed for moderation, search
  and upload by service-boundary `parseOrThrow()` and by converting the rest into real classes.
  A Zod schema in a `dto/` file is still invisible to the pipe

**Layer 4 — Circuit breakers: ✅** see Principle #12

**Resource quotas per user/tenant:** ⛔ **NOT IMPLEMENTED.** Throttling is per-user for three
tiers, which is not a quota — nothing deducts from a balance, and there is no storage cap per user
or tenant.

### #16 Smart Hybrid Consistency — ⚠️ PARTIAL
- ✅ The three-way classification is documented and `docs/consistency-matrix.md` has been
  reconciled against all 33 tables
- ✅ Causal ordering is real in the schema: `comments.parent_id` is a self-referencing FK, and
  messages are timestamp-ordered
- ✅ Eventual is real for notifications, story → Sanity sync, and derived analytics
- ⛔ **"Monitoring for consistency violations" is not implemented.** No code compares a cache read
  against the database to detect divergence
- ⛔ **"Compensation mechanisms for inconsistencies" is not implemented.** There is no saga, no
  compensating action, and no reconciliation job
- ⚠️ Causal consistency is a **schema property, not an enforcement mechanism** — nothing rejects a
  write that violates the ordering
- ✅ The causal-consistency bug recorded in the previous audit is **fixed**:
  `comments.repository.ts` used `eq(comments.parentId, null as unknown as string)`, which emits
  `parent_id = NULL` and is never true, so `GET /api/v1/comments/story/:storyId` always returned
  zero top-level comments. It now uses `isNull(...)`, and the row query and the count query share
  one `visibleTopLevel` predicate so page and count cannot drift

### #17 Warning Against Massive Linting — ✅ OBSERVED
- ✅ No `lint --fix --max-warnings 0` sweep over the repository exists
- ✅ CI runs `eslint` **as a checker, with no `--fix`**, and separately runs `prettier --check`
- ✅ The 0-error / ~895-warning state was reached by fixing files individually
- ⚠️ `npm run format:fix` exists in `backend/package.json` and would rewrite `src/**/*.ts`,
  `test/**/*.ts`, `e2e/**/*.ts`, and `scripts/**/*.ts` in one pass. ⚠️ The repository is written at
  ~120 columns; the earlier default of 80 made `prettier --check` fail on 210+ files. **Running
  `format:fix` today is exactly the mass rewrite this principle forbids** — it is a real
  footgun, not a hypothetical

---

## 📋 Full Verdict Summary

**✅ ENFORCED (5):** #1 zero `any` · #3 IDs as strings · #6 minimize migrations · #9 SSOT ·
#10 unified typing files

**⚠️ PARTIAL (8):** #2 logger · #7 loose coupling · #8 open/closed · #11 Valkey cache ·
#14 AP as default · #15 proactive defense · #16 hybrid consistency · #17 warning against mass
linting *(observed, no automated gate)*

**🔄 IN PROGRESS (4):** #4 document problems · #5 architecture before code · #12 reduce
synchronization · #13 automate modifications

**No principle is COMPLIANT. Nothing in this codebase satisfies every enforcement bullet of any
principle**, and the two that come closest (#1 and #6) are close only because their bullets are all
mechanically checkable.

### Changed since the previous audit

#### Round 2 — the 488-file change set (see ADR 005)

| Principle | Before | After | Why |
|---|---|---|---|
| #6 Minimize migrations | ✅ | ✅ | Advisory lock, per-migration lock/statement timeouts, and a prefix check that closes the sandwiched out-of-order case. `push-schema.ts` deleted; `drizzle-kit` declared |
| #7 Loose coupling | ⚠️ | ⚠️ | `OwnershipGuard` wired on comments and stories via per-module repository resolvers. Books write routes still unprotected — the table has no owner column |
| #9 SSOT | ✅ | ✅ | Valkey connection resolved once for the cache *and* the Socket.IO adapter; the published-secret rule shared by the JWT and encryption configs |
| #14 AP as default | ⚠️ | ⚠️ | Unchanged verdict, but `default` rate limit corrected from an accidental 10× loosening to 30/min, and the `user` tracker's per-IP degradation is documented where it is configured |
| #15 Proactive defense | ⚠️ | ⚠️ | WAF prose false-positives eliminated by tightening four patterns; SSRF host-shape rule added; body-size bypass closed; a `session` tier separates machine refresh from human login. Still ⚠️ — no admin endpoints, no metrics, no CSP, no XXE, no quotas |
| #16 Hybrid consistency | ⚠️ | ⚠️ | The `parent_id = NULL` bug that made top-level comments always empty is fixed. Still ⚠️ — no violation detection, no compensation mechanism |

#### Round 1

| Principle | Before | After | Why |
|---|---|---|---|
| #11 Valkey cache | ⚠️ PARTIAL — TTL ✅, cache-aside ✅, tag invalidation ✅, **hit-rate monitoring ❌** | ⚠️ PARTIAL — **hit-rate monitoring ✅**, but write-through ⛔ and cache-warming ⛔ | `GET /api/v1/metrics/cache` now serves live `hits` / `misses` / `hitRate`. Still not COMPLIANT: `@CacheWarmTags` has no caller and no write-through path exists |
| #12 Reduce synchronization | ⚠️ PARTIAL — resilience primitives were **dead code** | 🔄 IN PROGRESS | `CircuitBreakerService` injected into `auth.service.ts` and `sanity.service.ts`; `ResilientHttpClient` fronts `PaymobClient`; DLQ catches failed handlers. PostgreSQL and Valkey still have no breaker |
| #15 Proactive defense | ⚠️ PARTIAL — rate limiting *claimed* against an in-memory store that contradicted `11_decisions.md`; WAF layers partial | ⚠️ PARTIAL — **rate limiting is now real**; WAF still partial | 4 tiers over `ValkeyThrottlerStorage` with 429 tests; WAF admin endpoints, metrics, CSP and XXE coverage all still missing |
| #1 Zero `any` | ✅ | ✅ | `eslint src/ test/ e2e/` → 0 errors |
| #6 Minimize migrations | ✅ | ✅ | transaction wrapping, sha256 ledger, reversibility classification, `db:check` CI gate |
| #9 SSOT | ✅ | ✅ | `AuthorSummary.name` is now `string \| null`; `Exact<A,B>` drift assertions |
| #10 Unified typing files | ✅ | ✅ | frontend consumes the compiled package; no blind `as` casts in `api.ts` |
| #16 Hybrid consistency | ⚠️ | ⚠️ | Unchanged verdict, but the `parent_id = NULL` bug is now recorded |
| #14 AP as default | ⚠️ | ⚠️ | Unchanged — still no row locking or version columns on the money path |

---

## ⛔ Unbuilt Features These Principles Assume

The principles above describe rules the code does not yet satisfy. Each of these is a **retained
requirement**, not a description. They are consolidated here so the principles are not mistaken for a
capability inventory.

| Feature | Which principle assumes it | Reality |
|---|---|---|
| **MFA / TOTP + recovery codes** | #15 (proactive defense), #9 (SSOT for auth state) | ⛔ **Not built.** `grep -rn "mfa\|totp\|two.factor\|2fa"` across `backend/src`, `frontend/src`, `packages/` returns **zero** matches. No `POST /auth/mfa`. An admin account is protected by authorization only |
| **Account lockout after failed logins** | #15 | ⛔ **Not built.** `auth.service.ts` keeps no attempt counter. The only brake is the `auth` rate-limit tier: 10/min per IP — a brake on the *IP*, not the account |
| **Session store** | #11 (Valkey for sessions), #16 | ⛔ **Not built.** No session table, no session key in Valkey, no device/IP capture, no concurrent-session cap. `session:{userId}` in the cache table is fictional. A session is a signed JWT pair; the only server-side token state is the refresh-token blacklist |
| **Permission-decision audit trail** | #9 (SSOT), #15 | ⛔ **Not built.** Zero `audit` hits in `backend/src/common/permissions/` and `backend/src/common/guards/`. Moderation *actions* are recorded, but not authorization decisions |
| **Read replicas / read-write splitting** | #12 (reduce synchronization), #14 (AP default) | ⛔ **Not built.** `grep -rni "replica" --include='*.ts' backend/src/` returns nothing. One primary; no `DB_REPLICA_*`. See `system-architecture/infrastructure/read-replicas.md`, which is marked as a proposal |
| **Backup automation** | #6 (minimize migrations: "backup before migrations"), #16 (disaster recovery) | ⛔ **Not built.** No backup job, no `pg_dump` schedule, no PITR, no restore drill. `pg_dump` appears only inside documentation. This is what makes the RPO/RTO targets unachievable |
| **Resource quotas per user/tenant** | #15 | ⛔ **Not built.** No tiers, no balances, no counters that deduct. The throttler limits a 60-second window; it is a rate limit, not a quota |
| **Write-through caching + cache warming** | #11 | ⛔ **Not built.** The write path invalidates. `@CacheWarmTags` exists with no caller |
| **Consistency-violation detection** | #16 | ⛔ **Not built.** No code compares a cache read against the database to detect divergence |
| **Compensation mechanisms** | #16 | ⛔ **Not built.** No saga, no compensating action, no reconciliation job |
| **Plugin architecture for optional features** | #8 (open/closed) | ⛔ **Not built.** The email path is configured but has no pluggable transport — in fact no SMTP client exists at all |
| **Monitoring dashboards + alerting** | #4, #15 | ⛔ **Not built.** Sentry receives errors and `GET /api/v1/metrics/cache` reports hit rate, but there is no dashboard definition and **no alert rule anywhere in the repository** |
| **Pessimistic / optimistic locking** | #14 (strong consistency for payments) | ⛔ **Not built.** No `SELECT … FOR UPDATE`, no version column. The only money-path concurrency control is a `uniqueIndex` on `payments.paymob_transaction_id`, which prevents duplicate *rows*, not duplicate *charges* |
| **User documentation** | #4, #5 | ⛔ **Not built.** No user-facing docs exist outside `docs/` |
| **CHANGELOG** | #4 (explicitly listed as a documentation type) | ⛔ **Not built.** No CHANGELOG file in the repository |
| **Email delivery** | #15, #9 | ⛔ **Not built.** No SMTP client. Only `EMAIL_FROM` is read, by `notifications-email.service.ts` |

All 16 are tracked in `docs/roadmap/phases/implementation-roadmap.md` → *Open Items*.

---

## 🎯 How to Use These Principles

1. **Read** all principles before starting any work
2. **Reference** them during design and code review
3. **Enforce** them via CI/CD and code review
4. **Update** them as the system evolves — the verdict column above is the mechanism

---

*These principles are the foundation of the Hakawi architecture. They are not suggestions — they
are rules. The verdicts are honest, including where the code does not yet meet them.*
