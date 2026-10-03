# Phases

## Hakawi Implementation Phases

This document is a high-level summary. **The phase boundaries, milestone weeks, and coverage target
are defined in [`phases/implementation-roadmap.md`](./phases/implementation-roadmap.md), which is
canonical.** This file, [`timeline.md`](./timeline.md),
[`milestones/milestones.md`](./milestones/milestones.md) and
[`deliverables/deliverables.md`](./deliverables/deliverables.md) all follow it.

Status markers: ✅ shipped · 🔄 in progress · ⛔ not built.

---

## Phase Summary

| Phase | Name | Weeks | Focus | Status |
|-------|------|-------|-------|--------|
| 1 | Foundation | 1–2 | Monorepo setup, NestJS, Next.js, Docker Compose, CI/CD, database schema, auth, WAF, logger, event bus | ✅ Complete |
| 2 | Core Domain | 3–5 | Users, stories, categories, tags, search (PostgreSQL full-text), Sanity CMS integration | ✅ Complete |
| 3 | Social Features | 6–7 | Follows, reactions, comments, notifications, direct messaging | ✅ Complete |
| 4 | Books & Commerce | 8–10 | Books CRUD, PDF upload, sales, rentals, Paymob payments, webhook handling | ✅ Complete |
| 5 | Contests | 11–12 | Contest creation, submissions, voting, winner selection, prize distribution, badges | ✅ Complete |
| 6 | Moderation | 13 | Reporting, auto-escalation, moderation actions, user restrictions, admin dashboard | ✅ Complete |
| 7 | Polish & Launch | 14–18 | Testing & optimisation, event schema registry, resilience, documentation, deployment, final testing | 🔄 In progress |

**Total: 18 weeks (4.5 months). Phases 1–6 are complete. Phase 7 is the only open phase, and its
open items are all infrastructure and operations — read replicas, load testing, a deployment
artifact, backup automation, alerting, and user documentation.**

---

## Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

All phases are sequential. No parallel tracks are planned.

In practice the strict ordering did not hold: the **event schema registry, dead letter queue,
circuit breakers, retry, timeout and fallback primitives** were scheduled for Week 15–16 but
shipped during Phases 1–2, and **Phase 6 moderation was completed before Phase 4 payments**. The
dependency chain above describes the plan, not the delivery order.

---

## Milestones

| Milestone | Phase | Week | Key Deliverable | Status |
|-----------|-------|------|-----------------|--------|
| M1: Foundation | 1 | 2 | Auth + database + infrastructure | ✅ |
| M2: Core Content | 2 | 5 | Users + stories + search | ✅ |
| M3: Social | 3 | 7 | Interactions + notifications + messages | ✅ |
| M4: Books & Sales | 4 | 9 | Books + sales + rentals | ✅ |
| M5: Payments | 4 | 10 | Payment integration + E2E tests | ✅ |
| M6: Contests | 5 | 12 | Contest system complete | ✅ |
| M7: Moderation | 6 | 13 | Moderation system | ✅ |
| M8: Production | 7 | 18 | Fully tested and deployed | ⛔ Not met |

---

## What is still open

All of it lives in Phase 7. The full list, with evidence for each absence, is in
[`phases/implementation-roadmap.md`](./phases/implementation-roadmap.md#open-items--the-complete-list-of-⛔-work).

- ⛔ Read replicas, read/write splitting, replication-lag monitoring
- ⛔ Load testing and performance benchmarking
- ⛔ A production `Dockerfile` or deployment artifact — **there is no `Dockerfile` in the repository**
- ⛔ Staging and production deployment
- ⛔ Backup automation (the strategy is documented; nothing runs it)
- ⛔ Alerting rules
- ⛔ User-facing documentation
- ⛔ Security penetration testing
- ⛔ Live-sandbox payment testing

---

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| Phase 4 = weeks 8–10 here, **9–11** in `milestones.md`, `deliverables.md`, and `risks.md` | Unified on **8–10** (this file and `implementation-roadmap.md` agreed; the other three were the outliers) |
| Phase 5 = weeks 11–12 here, **12–13** in the other three | Unified on **11–12** |
| Phase 6 = week 13 here, folded into "Phase 6: Moderation & Polish, weeks 14–16" in `deliverables.md`, and into "M6 Production, weeks 14–16" in `milestones.md` | Unified on **week 13** as a standalone phase |
| `milestones.md` had 6 milestones ending week 16; everything else had 8 ending week 18 | Unified on **8 milestones ending week 18** |
| No status column at all | Added, with Phases 1–6 ✅ and Phase 7 🔄 |
| — | Recorded that the strict sequential ordering did not hold: Phase 7's event-registry and resilience work shipped early, and moderation completed before payments |

---

*This is a summary. See [`implementation-roadmap.md`](./phases/implementation-roadmap.md) for complete
phase details, exit criteria, testing strategy, critical path, and risk management.*
