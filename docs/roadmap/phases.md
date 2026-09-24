# Phases

## Hakawi Implementation Phases

This document provides a high-level summary of the implementation phases. For detailed week-by-week breakdowns, exit criteria, deliverables, and risk management, see [`implementation-roadmap.md`](./implementation-roadmap.md).

---

## Phase Summary

| Phase | Name | Weeks | Focus |
|-------|------|-------|-------|
| 1 | Foundation | 1–2 | Monorepo setup, NestJS, Next.js, Docker, CI/CD, database schema, auth, WAF, logger, event bus |
| 2 | Core Domain | 3–5 | Users, stories, categories, tags, search (PostgreSQL full-text), Sanity CMS integration |
| 3 | Social Features | 6–7 | Follows, reactions, comments, notifications, direct messaging |
| 4 | Books & Commerce | 8–10 | Books CRUD, PDF upload, sales, rentals, Paymob payments, webhook handling |
| 5 | Contests | 11–12 | Contest creation, submissions, voting, winner selection, prize distribution |
| 6 | Moderation | 13 | Reporting, auto-escalation, moderation actions, user restrictions, admin dashboard |
| 7 | Polish & Launch | 14–18 | Testing & optimization, event schema registry, read replicas, documentation, deployment, final testing |

**Total: 18 weeks (4.5 months)**

---

## Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

All phases are sequential. No parallel tracks are planned.

---

## Milestones

| Milestone | Phase | Week | Key Deliverable |
|-----------|-------|------|-----------------|
| M1: Foundation | 1 | 2 | Auth + database + infrastructure |
| M2: Core Content | 2 | 5 | Users + stories + search |
| M3: Social | 3 | 7 | Interactions + notifications + messages |
| M4: Books & Sales | 4 | 9 | Books + sales + rentals |
| M5: Payments | 4 | 10 | Payment integration + E2E tests |
| M6: Contests | 5 | 12 | Contest system complete |
| M7: Moderation | 6 | 13 | Moderation system |
| M8: Production | 7 | 18 | Fully tested and deployed |

---

*This is a summary. See [`implementation-roadmap.md`](./implementation-roadmap.md) for complete phase details, exit criteria, testing strategy, critical path, and risk management.*
