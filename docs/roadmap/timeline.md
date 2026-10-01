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

Everything blocking M8 is infrastructure, not product: read replicas, load testing, a
`Dockerfile`, a deployment manifest, backup automation, and alerting.

---

## High-Risk Items — actual status

| Item | Phase | Risk Level | Mitigation | Status |
|---|---|---|---|---|
| Payment integration (Paymob) | 4 | High | Zod-validated client, Valkey-cached auth token, `ResilientHttpClient` with circuit breaker + retry, clean 503 failure instead of a fabricated URL | ✅ Built; ⛔ never run against a live sandbox |
| Sanity CMS integration | 2 | Medium | `CircuitBreakerService` wrapper, PostgreSQL fallback | ✅ Built |
| Testing coverage | All | High | TDD, 2192 tests across three suites, 9-job CI with hard gates | ✅ Built; ⚠️ frontend statements/lines 44.25 vs the 80% target |
| Migration data loss | All | High | sha256 content-checksum ledger, per-migration transactions, reversibility classification (`reversible` / `data-loss` / `irreversible`) | ✅ Materially reduced |
| Performance under load | 7 | Medium | Cache-aside + tagged invalidation + hit-rate metrics | ⛔ Unmitigated — no load test or benchmark exists |

---

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| Phase 4 = weeks 8–10 here, **9–11** in `milestones.md`, `deliverables.md`, `risks.md` | Unified on **8–10** |
| Phase 5 = weeks 11–12 here, **12–13** in the other three | Unified on **11–12** |
| Phase 6 = week 13 here, "Moderation & Polish, weeks 14–16" in `deliverables.md`, and inside "M6 Production, weeks 14–16" in `milestones.md` | Unified on **week 13** as a standalone phase |
| `milestones.md` ended at week 16 with 6 milestones | Unified on **8 milestones ending week 18** |
| No status information at all | Added a status column to every table, and a milestone calendar |
| "TDD from Week 1, 80% minimum coverage" as a risk mitigation | Kept, with the measured numbers: backend S 80.56 / B 76.02 / F 72.60 / L 80.72; frontend S 44.25 / B 87.05 / F 53.69 / L 44.25 |
| "Sandbox testing from Week 10" for Paymob | ⛔ Never happened — no test has ever called the Paymob API |

---

*This is a summary. See [`implementation-roadmap.md`](./phases/implementation-roadmap.md) for the complete
timeline, critical path analysis, risk register, and post-launch roadmap.*
