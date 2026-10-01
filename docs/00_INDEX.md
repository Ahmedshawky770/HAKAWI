# Documentation Index
## حكاوي (Hakawi) - Project Documentation

Reconciled against the code on **2026-09-30**. Status in the table below is the document's own
**verification status** — whether it has been checked against the implementation — not a claim about
the software. Documents that still describe unbuilt behaviour are marked ⚠️ with the gaps named.

---

## 📚 Documents Structure

| # | Document | Description | Verified |
|---|----------|-------------|----------|
| 1 | `01_ARCHITECTURE_PRINCIPLES.md` | Core architecture principles, with a per-principle enforcement verdict | ✅ 2026-09-30 |
| 2 | `00_principles_index.md` + `01_`–`17_*.md` | Per-principle deep dives | ✅ index |
| 3 | `11_decisions.md` | Architecture Decision Records (ADRs) | ✅ 2026-09-30 (ADR-008 corrected) |
| 4 | `consistency-matrix.md` | Per-data-type consistency classification | ✅ 2026-09-30 |
| 5 | `adr/001`–`adr/004` | Drizzle · NestJS · Valkey · EventEmitter2 decisions | ✅ 004 corrected |
| 6 | `c4-model/README.md` | C4 model index | ✅ 2026-09-30 |
| 7 | `c4-model/context/*` | System context, actors, external systems | ✅ 2026-09-30 |
| 8 | `c4-model/container/*` | Container diagram and per-container detail | ✅ 2026-09-30 (Next.js 16.3.5, no Shadcn) |
| 9 | `c4-model/component/module-boundaries.md` | C4 component view: module responsibilities, dependency rules | ✅ 2026-09-30 (fully rewritten) |
| 9b | `c4-model/code/domain-concepts.md` | C4 code view: domain vocabulary mapped to the real tables and 53 events | ✅ 2026-09-30 (fully rewritten) |
| 10 | `system-architecture/overview/high-level-architecture.md` | System architecture overview | ✅ 2026-09-30 |
| 11 | `system-architecture/non-functional-requirements.md` | NFRs, with a per-claim verification status | ✅ 2026-09-30 (fully rewritten) |
| 12 | `system-architecture/ui-ux-design-system.md` | UI/UX design system | ⚠️ not audited |
| 13 | `system-architecture/infrastructure/read-replicas.md` | Read replica strategy | ⛔ **describes an unbuilt system** |
| 14 | `data-architecture/overview/data-architecture.md` | Data architecture overview | ⚠️ not audited |
| 14b | `data-architecture/seeders/seed-strategy.md` | Seed strategy | ✅ 2026-09-30 (paths and scripts corrected) |
| 15 | `data-architecture/schema/schema-overview.md` | Schema: 33 tables, ID strategy, audit fields | ✅ 2026-09-30 (fully rewritten) |
| 16 | `data-architecture/erd/entity-relationship.md` | ERD: real FKs, indexes, cascade rules | ✅ 2026-09-30 (fully rewritten) |
| 17 | `data-architecture/migrations/migration-strategy.md` | Migration runner, checksums, rollback classes | ✅ 2026-09-30 (fully rewritten) |
| 19 | `security-architecture/overview/security-architecture.md` | Security architecture | ✅ 2026-09-30 |
| 20 | `security-architecture/auth/auth-overview.md` | Tokens, cookies, sessions | ✅ 2026-09-30 (MFA marked unbuilt) |
| 21 | `security-architecture/permissions/permissions-overview.md` | RBAC, 51 permissions, guards | ✅ 2026-09-30 (fully rewritten) |
| 22 | `security-architecture/waf/waf-overview.md` | 34 rules, 8 layers, blocklist, throttling | ✅ 2026-09-30 (fully rewritten) |
| 23 | `security-architecture/compliance/compliance-overview.md` | Compliance notes | ⚠️ not audited |
| 24 | `security/{authentication,authorization,compliance,data-protection,waf-rules}.md` | Flat security set | ⚠️ not audited — see the `security-architecture/` set instead |
| 25 | `module-boundaries/overview/module-boundaries.md` | **Authoritative module inventory** — 23 registered modules | ✅ 2026-09-30 (fully rewritten) |
| 26 | `module-boundaries/events/event-schema-registry.md` | Event registry + DLQ | ⚠️ not audited (both are now built) |
| 27 | `module-boundaries/payments/payment-system.md` | Paymob flows, webhooks, refunds | ✅ 2026-09-30 |
| 28 | `module-boundaries/contracts.md` | The real repository interfaces and event shapes | ✅ 2026-09-30 (fully rewritten) |
| 28b | `module-boundaries/dependency-rules.md`, `interfaces.md` + nested dirs | ⚠️ **four near-duplicate pairs**, no canonical file named. `contracts.md` is now the audited one |
| 29 | `api-contract/openapi/rest-api-spec.md` | REST API specification — all 149 routes enumerated | ✅ 2026-09-30 (fully rewritten) |
| 30 | `api-contract/error-handling.md` | Error contract and codes | ✅ 2026-09-30 (14 codes marked unbuilt) |
| 31 | `api-contract/{examples,openapi-spec,integration-tests,postman-collection}.md` | Supporting API docs | ⚠️ `integration-tests.md` describes Supertest; the suite is Vitest. `postman-collection.md` ✅ baseUrl corrected to 3001 |
| 32 | `development/setup.md` | Development setup guide | ✅ 2026-09-30 |
| 33 | `development/code-standards.md` | Code standards | ✅ 2026-09-30 |
| 34 | `testing/testing-strategy.md` | Suites, coverage, isolation, CI | ✅ 2026-09-30 (fully rewritten) |
| 35 | `deployment/deployment.md` | Deployment guide | ✅ 2026-09-30 (no artifact behind it) |
| 36 | `deployment/environment.md` | 67 backend env vars, audited | ✅ 2026-09-30 (fully rewritten) |
| 37 | `deployment/backup.md` | Backup and recovery procedures | ✅ 2026-09-30 (nginx.conf / scripts/ removed) |
| 38 | `deployment/backup-strategy.md` | Backup strategy | ✅ 2026-09-30 (still ⛔ unautomated) |
| 39 | `deployment/runbooks.md` | Operational runbooks | ✅ 2026-09-30 |
| 40 | `roadmap/phases/implementation-roadmap.md` | **Canonical** 18-week roadmap, 8 milestones | ✅ 2026-09-30 (fully rewritten) |
| 41 | `roadmap/phases.md` | Phase summary | ✅ 2026-09-30 |
| 42 | `roadmap/timeline.md` | Timeline and milestone calendar | ✅ 2026-09-30 |
| 43 | `roadmap/milestones/milestones.md` | Milestone gates and verification | ✅ 2026-09-30 (fully rewritten) |
| 44 | `roadmap/deliverables/deliverables.md` | Phase deliverables | ✅ 2026-09-30 (fully rewritten) |
| 45 | `roadmap/risks.md` | Risk register and decision points | ✅ 2026-09-30 |

**Legend:** ✅ audited against the code · ⚠️ not yet audited · ⛔ describes a system that does not exist.

---

## ⚠️ Known Documentation Gaps

Four things a reader should know before trusting this documentation set:

1. **`docs/system-architecture/infrastructure/read-replicas.md` describes an unbuilt system.** There
   are no read replicas and no read/write splitting. `grep -rni "replica" backend/src` returns
   nothing. The file now carries a ⛔ **NOT IMPLEMENTED** banner at the top and is explicitly a
   proposal.
2. **`docs/module-boundaries/` has four near-duplicate pairs** — `contracts.md` /
   `contracts/module-contracts.md`, `dependency-rules.md` / `dependencies/dependency-rules.md`,
   `interfaces.md` / `interfaces/shared-interfaces.md`, plus a flat `security/` set that overlaps
   `security-architecture/`. **`contracts.md` is now the audited one**; the others are not marked
   subordinate, so they can still drift apart silently.
3. **~10 documents have not been audited.** They are listed above as ⚠️. The audit covered every
   document the refactor touched, plus the roadmap, testing, deployment, security, data
   architecture, module-boundaries, C4, and NFR sets. It did **not** cover:
   `data-architecture/overview/`, `data-architecture/erd/` (audited, but the ERD *mermaid* diagram
   upstream of the text was not regenerated), `c4-model/README.md`, `system-architecture/ui-ux-design-system.md`,
   the flat `security/` set, `module-boundaries/events/`, and the flat `contracts.md` /
   `dependency-rules.md` / `interfaces.md` duplicates.
4. **Four live frontend/backend route mismatches are documented, not fixed.**
   `api-contract/openapi/rest-api-spec.md` → *Known Frontend / Backend Route Mismatches* lists the
   calls in `frontend/src/lib/api.ts` that 404: the comments list route, the three reaction routes,
   the two upload routes, the three follows routes, and the moderation PATCH. `frontend/src` is
   outside the documentation scope, so these are recorded rather than corrected.

---

## 🎯 Quick Navigation

### For Architects
- Start with: `01_ARCHITECTURE_PRINCIPLES.md` (see the per-principle verdict table)
- Then: `c4-model/README.md`
- Then: `system-architecture/overview/high-level-architecture.md`
- Then: `consistency-matrix.md`

### For Developers
- Start with: `development/setup.md`
- Then: `development/code-standards.md`
- Then: `module-boundaries/overview/module-boundaries.md`
- Then: `testing/testing-strategy.md`

### For DevOps
- Start with: `deployment/deployment.md` — **read the "Missing artifact" section first**
- Then: `deployment/environment.md` (follows `backend/.env.example`)
- Then: `deployment/backup.md`

### For QA
- Start with: `testing/testing-strategy.md`

### For anyone evaluating readiness
- Start with: `roadmap/phases/implementation-roadmap.md` → *Open Items* (18 unbuilt items, each with
  the file that proves its absence)


---

## 📖 Reading Order

```
Phase 1: Foundation
├── 01_ARCHITECTURE_PRINCIPLES.md
├── 11_decisions.md
├── development/setup.md
└── development/code-standards.md

Phase 2: Architecture
├── c4-model/README.md
├── system-architecture/overview/high-level-architecture.md
├── consistency-matrix.md          ← start here for the current data model
├── data-architecture/schema/schema-overview.md
├── data-architecture/migrations/migration-strategy.md
└── security-architecture/overview/security-architecture.md

Phase 3: Design
├── module-boundaries/overview/module-boundaries.md
├── module-boundaries/payments/payment-system.md
├── module-boundaries/events/event-schema-registry.md
├── api-contract/openapi/rest-api-spec.md
└── api-contract/error-handling.md

Phase 4: Implementation
├── testing/testing-strategy.md
├── roadmap/phases/implementation-roadmap.md   ← canonical roadmap
├── roadmap/phases.md
├── roadmap/timeline.md
├── roadmap/milestones/milestones.md
├── roadmap/deliverables/deliverables.md
├── roadmap/risks.md
├── deployment/deployment.md
└── deployment/environment.md

Phase 5: Operations
├── deployment/backup.md
├── deployment/backup-strategy.md
├── deployment/runbooks.md
├── security-architecture/auth/auth-overview.md
├── security-architecture/permissions/permissions-overview.md
├── security-architecture/waf/waf-overview.md
└── security-architecture/compliance/compliance-overview.md
```

---

## 🚀 Getting Started

1. **Read** `01_ARCHITECTURE_PRINCIPLES.md` first — the verdict table tells you which rules the code
   actually enforces
2. **Set up** the development environment using `development/setup.md`
3. **Review** `system-architecture/overview/high-level-architecture.md`
4. **Check readiness** in `roadmap/phases/implementation-roadmap.md` → *Open Items* — the product is
   feature-complete; what is missing is infrastructure and operations

---

## 📂 Folder Structure

```
docs/
├── 00_INDEX.md                      # This file
├── 00_principles_index.md           # Per-principle deep-dive index
├── 01_ARCHITECTURE_PRINCIPLES.md    # Core principles + per-principle verdicts
├── 01_zero_any_policy.md            # ┐
├── 02_logger_over_console.md        # │
├── …                                # ├ the 17 principle deep dives
├── 17_warning_against_massive_linting.md  # │
├── 11_decisions.md                  # ┘ ADRs
├── 11_valkey_as_cache_layer.md
├── consistency-matrix.md            # Per-data-type consistency classification
├── adr/                             # 001-drizzle 002-nestjs 003-valkey 004-eventemitter2
├── c4-model/                        # C4 model docs
│   ├── README.md
│   ├── context/                     # System context, actors, external systems
│   ├── container/                   # Container diagram + per-container detail
│   ├── component/                   # Module boundaries
│   └── code/                        # Domain concepts
├── system-architecture/             # System architecture
│   ├── overview/high-level-architecture.md
│   ├── non-functional-requirements.md
│   ├── ui-ux-design-system.md
│   └── infrastructure/read-replicas.md   # ⛔ describes an unbuilt system
├── data-architecture/               # Data architecture
│   ├── overview/
│   ├── schema/schema-overview.md          # 33 tables
│   ├── erd/
│   ├── migrations/migration-strategy.md   # runner, checksums, rollback classes
│   └── seeders/
├── security-architecture/           # Security architecture
│   ├── overview/
│   ├── auth/
│   ├── permissions/
│   ├── waf/
│   └── compliance/
├── security/                        # ⚠️ flat set, overlaps security-architecture/
├── module-boundaries/               # Module boundaries
│   ├── overview/
│   ├── contracts/ + contracts.md          # ⚠️ duplicate pair
│   ├── dependencies/ + dependency-rules.md # ⚠️ duplicate pair
│   ├── interfaces/ + interfaces.md        # ⚠️ duplicate pair
│   ├── events/
│   └── payments/
├── api-contract/                    # API documentation
│   ├── openapi/
│   ├── postman/
│   ├── examples/
│   └── error-handling.md
├── development/                     # Development guides
│   ├── setup.md
│   └── code-standards.md
├── testing/testing-strategy.md      # Test suites, coverage, isolation, CI
├── deployment/                      # Deployment guides
│   ├── deployment.md
│   ├── environment.md
│   ├── backup.md
│   ├── backup-strategy.md
│   └── runbooks.md
└── roadmap/                         # Implementation roadmap
    ├── phases.md
    ├── phases/implementation-roadmap.md   # CANONICAL
    ├── timeline.md
    ├── milestones/milestones.md
    ├── deliverables/deliverables.md
    └── risks.md
```

---

## Changelog — reconciliation (2026-09-30)

| Change | Note |
|---|---|
| Every document was marked "✅ Draft" — a status that said nothing | Replaced with a **Verified** column: audited against the code on a date, not audited, or describing an unbuilt system |
| Only 26 of the ~90 documents were listed | Now grouped by directory with the full set |
| `roadmap/phases/implementation-roadmap.md` described as a "**16-week** implementation roadmap" | It is an **18-week** plan. The four other roadmap files disagreed with it on phase weeks, milestone count, and coverage target; all five are now aligned |
| No pointer to the unbuilt state | Added *Known Documentation Gaps*, and a *Start here for readiness* navigation entry |
| `docsNewHakawi/` in the folder tree | The directory is `docs/` |
| Missing from the tree: `adr/`, `security/`, `consistency-matrix.md`, `00_principles_index.md`, `testing/` (partial), the 17 principle files | All now listed |

---

*This documentation is the single source of truth for the Hakawi project. It was reconciled against
the code on 2026-09-30; the ✅ dates in the table above record when each document was last checked
against the implementation.*

