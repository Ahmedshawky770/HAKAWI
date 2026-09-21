# Architecture Principles
## حكاوي (Hakawi) - Core Principles

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
- User data: PostgreSQL only
- Story content: Sanity only
- User preferences: PostgreSQL only
- Analytics: Derived from primary sources

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
- Stories: Sanity only (read-only mirror in PostgreSQL)
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

| # | Principle | Category | Enforcement |
|---|-----------|----------|-------------|
| 1 | Zero `any` / `as any` | Code Quality | ESLint + CI |
| 2 | Logger over console | Code Quality | ESLint + CI |
| 3 | IDs as Strings | Code Quality | TypeScript + CI |
| 4 | Document Problems | Documentation | Process |
| 5 | Architecture Before Code | Architecture | Process |
| 6 | Minimize Migrations | Architecture | Process |
| 7 | Loose Coupling | Architecture | Code Review |
| 8 | Open/Closed Principle | Architecture | Code Review |
| 9 | Single Source of Truth | Architecture | Architecture |
| 10 | Unified Typing Files | Code Quality | Process |
| 11 | Valkey as Cache | Infrastructure | Docker + Config |
| 12 | Reduce Synchronization | Architecture | Architecture |
| 13 | Automate Modifications | Process | Process |
| 14 | AP as Default | Distributed Systems | Architecture |
| 15 | Proactive Defense | Security | WAF + Rate Limiting |
| 16 | Smart Hybrid Consistency | Distributed Systems | Architecture |
| 17 | Warning Against Massive Linting | Process | Process |

---

## 🎯 How to Use These Principles

1. **Read** all principles before starting any work
2. **Reference** them during design and code review
3. **Enforce** them via CI/CD and code review
4. **Update** them as the system evolves

---

*These principles are the foundation of the Hakawi architecture. They are not suggestions — they are rules.*
