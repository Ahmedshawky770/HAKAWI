# Timeline

## Hakawi Implementation Timeline

A high-level visual timeline. **Phase boundaries, milestone weeks, and the coverage target are
canonical in [`phases/implementation-roadmap.md`](./phases/implementation-roadmap.md).** This file,
[`phases.md`](./phases.md), [`milestones/milestones.md`](./milestones/milestones.md) and
[`deliverables/deliverables.md`](./deliverables/deliverables.md) all follow it.

Status markers: ✅ shipped · 🔄 in progress · ⛔ not built.

---

## Timeline Overview

```
Week:  1    2    3    4    5    6    7    8    9    10   11   12   13   14   15   16   17   18
       |----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
Phase: [P1: Foundation ✅]
              [P2: Core Domain ✅]
                            [P3: Social ✅]
                                       [P4: Books & Commerce ✅]
                                                          [P5: Contests ✅]
                                                                        [P6: Moderation ✅]
                                                                                  [P7: Polish & Launch 🔄]
```

---

## Phase Timeline

| Phase | Weeks | Duration | Key Focus | Status |
|-------|-------|----------|-----------|--------|
| 1: Foundation | 1–2 | 2 weeks | Infrastructure, auth, database | ✅ Complete |
| 2: Core Domain | 3–5 | 3 weeks | Users, stories, search | ✅ Complete |
| 3: Social Features | 6–7 | 2 weeks | Interactions, notifications, messages | ✅ Complete |
| 4: Books & Commerce | 8–10 | 3 weeks | Books, sales, rentals, payments | ✅ Complete |
| 5: Contests | 11–12 | 2 weeks | Contest system, voting, prizes, badges | ✅ Complete |
| 6: Moderation | 13 | 1 week | Reporting, moderation actions, admin dashboard | ✅ Complete |
| 7: Polish & Launch | 14–18 | 5 weeks | Testing, resilience, deployment | 🔄 In progress |

**Total: 18 weeks (4.5 months).**

---

## Milestone Calendar

| Week | Milestone | Status |
|------|-----------|--------|
| 2 | M1: Foundation | ✅ |
| 5 | M2: Core Content | ✅ |
| 7 | M3: Social | ✅ |
| 9 | M4: Books & Sales | ✅ |
| 10 | M5: Payments | ✅ |
| 12 | M6: Contests | ✅ |
| 13 | M7: Moderation | ✅ |
| 18 | M8: Production | ⛔ Not met — no deployment artifact, no staging, no production |

---

## Critical Path

1. **Foundation** (Phase 1) — gates everything ✅
2. **Core Domain** (Phase 2) — depends on Phase 1 ✅
3. **Books & Commerce** (Phase 4) — highest-risk phase (payment integration) ✅ built
4. **Polish & Launch** (Phase 7) — 🔄 the only open path, and it is the reason M8 has not been met

Everything blocking M8 is infrastructure, not product: read replicas, load testing automation, a
`Dockerfile` that exists but is not deployed, a deployment manifest, backup automation, and alerting
deployment. Two items are neither infrastructure nor product, and are ⛔ as of 2026-10-04: four social
UI pages have **no call sites** to the routes the client now points at, and the frontend coverage
gate certifies roughly 68% instead of the 80% target.

---

## High-Risk Items — actual status

| Item | Phase | Risk Level | Mitigation | Status |
|---|---|---|---|---|
| Payment integration (Paymob) | 4 | High | Zod-validated client, Valkey-cached auth token, `ResilientHttpClient` with circuit breaker + retry, clean 503 failure instead of a fabricated URL | ✅ Built; ⛔ never run against a live sandbox |
| Sanity CMS integration | 2 | Medium | `CircuitBreakerService` wrapper, PostgreSQL fallback | ✅ Built |
| Testing coverage | All | High | TDD, **3986 tests across four suites**, 11-job CI with hard gates | ✅ Built; ⚠️ frontend **S 68.39 / L 68.17** against an 80% target, and the frontend gate is set to 38/33/33/38 — it encodes the current number, not the target. ⛔ and until 2026-10-04 the 11-file integration suite had never executed |
| Migration data loss | All | High | sha256 content-checksum ledger, per-migration transactions, reversibility classification — **0 irreversible, 18 data-loss, 4 reversible** across the 22 down scripts | ✅ Materially reduced |
| Performance under load | 7 | Medium | Cache-aside + tagged invalidation + hit-rate metrics | ⛔ Unmitigated — k6 config exists but is not run in CI; no benchmark harness |
| **Backend could not boot** | 1 | **Fatal** | `forwardRef()` on both sides of the `BooksModule` ↔ `LibraryModule` cycle | ✅ **Retired 2026-10-04** |
| **CI green on a suite that did not run** | All | High | Fix the module graph; assert the integration specs execute | ✅ **Retired 2026-10-04** |

---

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| Phase 4 = weeks 8–10 here, **9–11** in `milestones.md`, `deliverables.md`, `risks.md` | Unified on **8–10** |
| Phase 5 = weeks 11–12 here, **12–13** in the other three | Unified on **11–12** |
| Phase 6 = week 13 here, "Moderation & Polish, weeks 14–16" in `deliverables.md`, and inside "M6 Production, weeks 14–16" in `milestones.md` | Unified on **week 13** as a standalone phase |
| `milestones.md` ended at week 16 with 6 milestones | Unified on **8 milestones ending week 18** |
| No status information at all | Added a status column to every table, and a milestone calendar |
| "TDD from Week 1, 80% minimum coverage" as a risk mitigation | Kept. ⛔ **the numbers this row originally recorded were wrong in all eight positions**: it cited backend S 85.43 / 82.39 / 79.00 / 85.58 against floors 78/70/73/79, and frontend S 39.79 / 35.90 / 35.74 / 40.22 against floors 38/33/33/38. Measured: backend **S 84.28 / B 80.49 / F 78.86 / L 84.45**, frontend **S 68.39 / B 68.75 / F 70.97 / L 68.17**. The floors are unchanged and correct. Corrected in the 2026-10-04 pass below |
| "Sandbox testing from Week 10" for Paymob | ⛔ Never happened — no test has ever called the Paymob API |

---

## Changelog — reconciliation (2026-10-04)

| Previous | Reality |
|---|---|
| "3523 tests across three suites" | **3986 across four suites** — 3036 backend unit (151 files) + 186 backend e2e/integration (22 files) + 749 frontend (59 files) + 15 Playwright (3 files). ⚠️ every one of the old figures was wrong: 3047, 136, 340 and 9 |
| "10-job CI with hard gates" | **11 jobs** — `migration-roundtrip` was omitted, and it is the only job that runs the down scripts and the one that catches an irreversible migration |
| Frontend coverage **S 39.79 / L 40.22** | **S 68.39 / L 68.17** (`frontend/coverage/coverage-summary.json`) |
| Backend coverage **S 85.43 / 82.39 / 79.00 / 85.58** | **S 84.28 / B 80.49 / F 78.86 / L 84.45** — all four were wrong |
| The whole timeline read as a smooth 18 weeks with no defect between phases | ⚠️ **two launch blockers were open the entire time and appear in no earlier row.** `BooksModule` ↔ `LibraryModule` had no `forwardRef()` — the backend could not boot — and `ContestsModule` imported `NotificationsModule` without listing it. Both are now **retired risks** with evidence. They belong in Phase 1, because that is where they broke the product |
| Migration reversibility given as "(`reversible` / `data-loss` / `irreversible`)" with no counts | **0 irreversible, 18 data-loss, 4 reversible** across the 22 down scripts. ⛔ `risks.md` had claimed `0001` was deliberately irreversible for `uuid-ossp`; it is not — it declares `reversibility=data-loss` |

---

*This is a summary. See [`implementation-roadmap.md`](./phases/implementation-roadmap.md) for the complete
timeline, critical path analysis, risk register, and post-launch roadmap.*
