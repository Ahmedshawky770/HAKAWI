# Timeline

## Hakawi Implementation Timeline

This document provides a high-level visual timeline. For detailed day-by-day schedules, owner assignments, and deliverables, see [`implementation-roadmap.md`](./implementation-roadmap.md).

---

## Timeline Overview

```
Week:  1    2    3    4    5    6    7    8    9    10   11   12   13   14   15   16   17   18
       |----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
Phase:  [P1: Foundation]
               [P2: Core Domain]
                            [P3: Social]
                                       [P4: Books & Commerce]
                                                           [P5: Contests]
                                                                       [P6: Moderation]
                                                                                   [P7: Polish & Launch]
```

---

## Phase Timeline

| Phase | Weeks | Duration | Key Focus |
|-------|-------|----------|-----------|
| 1: Foundation | 1–2 | 2 weeks | Infrastructure, auth, database |
| 2: Core Domain | 3–5 | 3 weeks | Users, stories, search |
| 3: Social Features | 6–7 | 2 weeks | Interactions, notifications, messages |
| 4: Books & Commerce | 8–10 | 3 weeks | Books, sales, rentals, payments |
| 5: Contests | 11–12 | 2 weeks | Contest system, voting, prizes |
| 6: Moderation | 13 | 1 week | Reporting, moderation actions |
| 7: Polish & Launch | 14–18 | 5 weeks | Testing, optimization, deployment |

**Total: 18 weeks (4.5 months)**

---

## Critical Path

1. **Foundation** (Phase 1) — Must complete first
2. **Core Domain** (Phase 2) — Depends on Phase 1
3. **Books & Commerce** (Phase 4) — High-risk due to payment integration
4. **Polish & Launch** (Phase 7) — Final testing, security audit, production deployment

---

## High-Risk Items

| Item | Phase | Risk Level | Mitigation |
|------|-------|------------|------------|
| Payment integration (Paymob) | 4 | High | Sandbox testing from Week 10, idempotent webhooks, comprehensive E2E tests |
| Sanity CMS integration | 2 | Medium | Early integration in Week 4, PostgreSQL fallback |
| Testing coverage | All | High | TDD from Week 1, 80% minimum coverage, CI/CD automation |

---

*This is a summary. See [`implementation-roadmap.md`](./implementation-roadmap.md) for the complete timeline, critical path analysis, risk register, and post-launch roadmap.*
