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
open items are a mix of infrastructure/operations and product gaps — read replicas, load testing
automation, staging/production deployment, backup automation, alerting deployment, user documentation,
security penetration testing, live-sandbox payment testing, and four social UI placeholder pages.**

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

Two defects sat **across** the ordering rather than inside any phase, and were open the whole
18 weeks: `BooksModule` ↔ `LibraryModule` had no `forwardRef()`, so the backend could not boot at all,
and `ContestsModule` imported `NotificationsModule` without listing it. The second consequence matters
more than either bug: **all 11 integration specs skipped themselves while CI stayed green.** Both fixed
2026-10-04; see `risks.md` for the retired-risk entries.

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

All of it lives in Phase 7 except two product gaps recorded in Phase 3/5. The full list, with
evidence for each absence, is in
[`phases/implementation-roadmap.md`](./phases/implementation-roadmap.md#open-items--the-complete-list-of-⛔-work).

- ⛔ Read replicas, read/write splitting, replication-lag monitoring (Phase 7, Week 16)
- ⛔ Load testing automation — `load-tests/k6.conf.js` exists but is not executed by any CI job
      (Phase 7, Weeks 14, 18)
- ⛔ Staging and production deployment — no manifest, IaC, or deploy script, despite a `Dockerfile`
      existing at the repo root (Phase 7, Week 18)
- ⛔ Backup automation — `scripts/backup.sh` exists but there is no cron job, scheduler, or PITR
      configuration running it (Phase 7, Week 17)
- ⛔ Alerting deployment — `monitoring/alert-rules.yml` exists but is not deployed or wired to any
      alertmanager (M8)
- ⛔ User-facing documentation — `docs/user/` has starter content; comprehensive help centre and
      onboarding are missing (Phase 7, Weeks 17, 18)
- ⛔ Security penetration testing (Phase 7, Week 18)
- ⛔ Live-sandbox payment testing (Phase 7, Week 14)
- ⛔ Two social UI pages have no navigation call sites: `/stories/[id]/comments`,
      `/stories/[id]/reactions` (functional read-only server components, but not linked from any main
      page or navigation element). `/users/[id]/followers` and `/users/[id]/following` ARE linked from
      profile pages (Phase 3)

Phases 1–6 are marked ✅, but a ✅ records that the phase's **items** shipped, not that the code was
correct when it did. Three phases shipped defects that were only found by executing the suite and
reading the routes: **Phase 1** could not boot the application; **Phase 2** leaked every draft to an
anonymous caller and returned 400 for every web-client search; **Phase 3** shipped twelve frontend
methods pointing at routes no controller declares. All are fixed. The one Phase 5-era item still ⛔ is
enumerated in `implementation-roadmap.md` Open Items: none — the duplicated contest notifications
defect has been resolved.

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

## Changelog — reconciliation (2026-10-04)

| Previous | Reality |
|---|---|
| The phase summary read as six clean ✅ phases, with the dependencies section noting only that delivery order differed from plan | ⚠️ **two launch blockers were open across the whole 18 weeks and appeared in no row**: `BooksModule` ↔ `LibraryModule` had no `forwardRef()`, so the backend could not boot; and `ContestsModule` imported `NotificationsModule` without listing it, so `ContestsEventHandler` could not resolve its service. Recorded here, in Phase 1 of the canonical roadmap, and as retired risks in `risks.md` |
| Nothing in this file recorded that the test suites were green | ⚠️ **all 11 `backend/test/*.integration-spec.ts` files were skipping themselves** because the module graph could not build — so "Phase 4 ✅" included a commerce suite that had never run a request. Fixed 2026-10-04 |
| "What is still open" listed nine infrastructure items only | Two ⛔ items are neither infrastructure nor product and are added by reference: **duplicated contest notifications** and **social UI pages with no call sites**. Both are enumerated in `implementation-roadmap.md` Open Items. ⚠️ **Correction:** the duplicate contest notifications defect has since been **resolved** by removing the duplicate handler in `notifications.event-handler.ts` |
| This file carried no test or coverage figures, so it could not itself go stale | Correct — and it still cannot. The numbers live in `phases/implementation-roadmap.md`, `milestones.md` and `deliverables.md`, where all of them were wrong before 2026-10-04 and are now measured |

*This is a summary. See [`implementation-roadmap.md`](./phases/implementation-roadmap.md) for complete
phase details, exit criteria, testing strategy, critical path, and risk management.*
