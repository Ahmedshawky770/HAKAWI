# Risks
## Hakawi Implementation Roadmap

This document identifies potential risks, mitigation strategies, and contingency plans for the Hakawi
implementation.

**Phase weeks are canonical in [`phases/implementation-roadmap.md`](./phases/implementation-roadmap.md).**
Week references in the mitigations below have been aligned to it.

Status markers: ✅ closed or materially reduced · 🔄 partially mitigated · ⛔ unmitigated.

---

## Risk Summary

| Risk | Probability | Impact | Mitigation | Status |
|------|-------------|--------|------------|--------|
| Authentication complexity | Medium | High | Use proven libraries, early testing | ✅ — JWT + 5 OAuth providers, bcrypt, refresh rotation, tiered rate limiting |
| Sanity CMS integration | Medium | Medium | Prototype early, have fallback | ✅ — `CircuitBreakerService` + PostgreSQL fallback |
| Payment integration | Low | High | Start early, thorough testing | 🔄 — the client is real and Zod-validated, but ⛔ never run against a live sandbox |
| Search performance | Medium | Medium | Use PostgreSQL full-text, caching | 🔄 — FTS + GIN indexes + tagged cache; ⛔ never load-tested |
| Real-time messaging | Medium | Medium | Use proven WebSocket library | 🔄 — Socket.IO + Redis adapter; ⛔ never load-tested |
| File upload (PDFs) | Low | Medium | Use S3/R2, validate early | ✅ — presigned S3 URLs, size and MIME validation |
| Migration complexity | Low | High | Test migrations thoroughly | ✅ — see "Risks retired by the refactor" below |
| Timeline slippage | Medium | High | Buffer week, parallel work | 🔄 — product scope is done; the slippage is now in Phase 7 operations |
| Team availability | Low | High | Cross-training, documentation | ✅ — `docs/` reconciled 2026-09-30 and re-verified 2026-10-04 |
| **Backend cannot boot (module graph)** | Was High | **Was fatal** | `forwardRef()` on both sides of the cycle | ✅ **RETIRED 2026-10-04** — see "Risks retired" below |
| **Integration suite silently skipping** | Was High | High | Fix the graph; assert the suite actually executes | ✅ **RETIRED 2026-10-04** — the 11 specs ran for the first time |
| **No deployment artifact** | High | High | Build a `Dockerfile` + manifest | ⛔ **Unmitigated — a `Dockerfile` exists but there is no CI workflow, IaC, or deploy script** |
| **No backup automation** | Medium | High | Scheduled `pg_dump` + PITR | ⛔ **Unmitigated — `scripts/backup.sh` exists but there is no cron job or scheduler running it** |
| **No load/performance testing** | High | Medium | k6 or Artillery suite | ⛔ **Unmitigated — `load-tests/k6.conf.js` exists but is not executed by any CI job; every p95 target is unmeasured** |
| **No alerting** | Medium | High | Define alert rules on the metrics that exist | 🔄 **`monitoring/alert-rules.yml` exists but is not deployed or wired to any alertmanager** |

---

## Detailed Risks

### Risk 1: Authentication Complexity

**Description**: Implementing OAuth, JWT, email verification, and password reset can be complex.

**Probability**: Medium

**Impact**: High (blocks all other development)

**Mitigation**:
- Use NestJS Passport library
- Follow established patterns
- Implement incrementally
- Test each auth flow separately

**Contingency**:
- Start with simple JWT, add OAuth later
- Use Auth0 or similar service if needed

**Early Warning Signs**:
- Token refresh not working
- Session invalidation issues
- CORS problems

---

### Risk 2: Sanity CMS Integration

**Description**: Syncing stories between PostgreSQL and Sanity can be complex.

**Probability**: Medium

**Impact**: Medium (can use fallback)

**Mitigation**:
- Prototype integration early (Week 3)
- Use webhooks for real-time sync
- Implement conflict resolution
- Have PostgreSQL fallback

**Contingency**:
- Store stories only in PostgreSQL
- Use Sanity only for frontend preview
- Skip real-time sync initially

**Early Warning Signs**:
- Sync conflicts
- Data inconsistencies
- Performance issues

---

### Risk 3: Payment Integration

**Description**: Integrating Paymob payments can be complex with webhooks, retries, and error handling.

**Probability**: Low

**Impact**: High (blocks commerce features)

**Mitigation**:
- Start integration early (Week 10)
- Use Paymob SDK
- Implement idempotency
- Test in sandbox thoroughly

**Contingency**:
- Use manual payment verification
- Implement payment later
- Use alternative payment provider

**Early Warning Signs**:
- Webhook failures
- Duplicate charges
- Payment state inconsistencies

---

### Risk 4: Search Performance

**Description**: Full-text search on large datasets can be slow without proper indexing.

**Probability**: Medium

**Impact**: Medium (user experience)

**Mitigation**:
- Use PostgreSQL full-text search
- Implement caching layer
- Use Redis for popular queries
- Optimize queries with EXPLAIN

**Contingency**:
- Use Meilisearch or Algolia
- Implement basic search first, optimize later

**Early Warning Signs**:
- Slow query times (> 500ms)
- High database load
- User complaints

---

### Risk 5: Real-time Messaging

**Description**: Implementing real-time messaging with WebSockets can be complex.

**Probability**: Medium

**Impact**: Medium (can use polling fallback)

**Mitigation**:
- Use Socket.io or similar library
- Implement reconnection logic
- Use message queues for reliability
- Start with simple polling if needed

**Contingency**:
- Use polling instead of WebSockets
- Implement real-time later
- Use Firebase or similar service

**Early Warning Signs**:
- Connection drops
- Message loss
- High latency

---

### Risk 6: File Upload (PDFs)

**Description**: Handling PDF uploads for books can be complex with storage, validation, and streaming.

**Probability**: Low

**Impact**: Medium (core feature)

**Mitigation**:
- Use S3/R2 for storage
- Validate files early
- Implement streaming for large files
- Use multer or similar

**Contingency**:
- Use external storage service
- Limit file size
- Implement later if needed

**Early Warning Signs**:
- Upload failures
- Storage costs
- Performance issues

---

### Risk 7: Migration Complexity

**Description**: Database migrations can fail or cause data loss.

**Probability**: Low

**Impact**: High (data loss)

**Mitigation**:
- Test migrations on copy of production data
- Use transactions where possible
- Backup before migrations
- Rollback plan

**Contingency**:
- Manual migration scripts
- Database restore from backup
- Extended downtime

**Early Warning Signs**:
- Migration failures
- Data inconsistencies
- Performance degradation

---

### Risk 8: Timeline Slippage

**Description**: Development may take longer than planned.

**Probability**: Medium

**Impact**: High (delays launch)

**Mitigation**:
- Buffer week (Week 8)
- Parallel work where possible
- Regular progress reviews
- Prioritize features

**Contingency**:
- Reduce scope
- Extend timeline
- Add more resources

**Early Warning Signs**:
- Tasks taking longer than estimated
- Team burnout
- Bugs piling up

---

### Risk 9: Team Availability

**Description**: Team members may be unavailable due to illness, vacation, or other commitments.

**Probability**: Low

**Impact**: High (blocks development)

**Mitigation**:
- Cross-training
- Documentation
- Pair programming
- Regular knowledge sharing

**Contingency**:
- Reassign tasks
- Hire contractors
- Delay non-critical features

**Early Warning Signs**:
- Team members missing
- Knowledge silos
- Low morale

---

## Risk Management Process

### Weekly Review
- Review risk register
- Update probability and impact
- Check early warning signs
- Update mitigation strategies

### Risk Escalation
1. Identify risk
2. Assess impact
3. Propose mitigation
4. Escalate to project lead if needed
5. Implement mitigation
6. Monitor effectiveness

### Risk Documentation
- Document all identified risks
- Track mitigation progress
- Record lessons learned
- Update risk register

---

## Contingency Plans

### Plan A: Full Implementation
- Follow original timeline
- All features implemented
- Full testing
- Production deployment
- ⛔ **Not achievable as written:** no deployment artifact exists. This plan requires a
  `Dockerfile`, a deployment manifest, and backup automation before it can be executed.

### Plan B: Reduced Scope
- Delay non-critical features
- Focus on core functionality
- Simplified moderation
- Basic notifications

### Plan C: Phased Rollout — the plan that fits the current state
- **Product scope is already complete** (Phases 1–6 ✅). There is nothing to cut on the feature
  side.
- Launch the features that are safe without production infrastructure: the API, the web client, the
  admin dashboard.
- Defer the payment path until a live-sandbox verification has been performed.
- Defer until a deployment artifact exists: read replicas, load testing, backup automation,
  alerting.
- Monitor and iterate on the metrics that already exist: Sentry, Winston, `GET /api/v1/metrics/cache`.

---

## Decision Points

Aligned to the canonical phase exit weeks in
[`phases/implementation-roadmap.md`](./phases/implementation-roadmap.md). The previous list used
Weeks 2, 5, 8, 11, 13 and 15, which did not correspond to any phase boundary (it was inherited
from the 6-milestone/16-week model that the rest of the roadmap has now abandoned).

| Week | Phase ends | Go/No-Go question | Status |
|------|-----------|-------------------|--------|
| 2 | Phase 1: Foundation | Foundation complete? Ready for core domain? | ✅ Go |
| 5 | Phase 2: Core Domain | Core domain complete? Ready for social? | ✅ Go |
| 7 | Phase 3: Social | Social complete? Ready for commerce? | ✅ Go |
| 10 | Phase 4: Books & Commerce | Commerce complete? Payments tested? | ✅ Go — with the open item that no test has run against a live Paymob sandbox |
| 12 | Phase 5: Contests | Contests complete? | ✅ Go |
| 13 | Phase 6: Moderation | Moderation complete? | ✅ Go |
| 18 | Phase 7: Polish & Launch | Tested, measured, deployed, backed up, alerting? | ⛔ **No-go** — load testing is not automated in CI, no benchmark harness, no CI deploy workflow, backup script exists but is not automated, and alert rules exist but are not deployed |

### What blocks the Week 18 decision
1. A `Dockerfile` exists but there is no CI workflow, IaC, or deploy script
2. No load test or performance benchmark in CI — `load-tests/k6.conf.js` exists but is not executed;
      the p95 targets have never been measured
3. `scripts/backup.sh` exists but there is no cron job, scheduler, or PITR configuration running it,
      so there is nothing to restore from
4. `monitoring/alert-rules.yml` exists but is not deployed or wired to any alertmanager
5. No WAF metrics endpoint or WAF admin operations endpoints
6. ⛔ Frontend coverage at **68.39** statements / **68.17** lines, against an 80% target — and the CI
      gate is set to 38/33/33/38, so a passing build certifies roughly 68%, not 80%. ⚠️ **both published
      figures were wrong** (the document said 40.75 / 41.25); re-derive from
      `frontend/coverage/coverage-summary.json`
7. ⛔ **Two social UI pages have no navigation call sites.** The frontend client methods for
   follow/react/comment are now correct and pinned to the backend controllers, and all four pages are
   functional read-only server components (`comments/page.tsx`, `reactions/page.tsx`,
   `followers/page.tsx`, `following/page.tsx`). However, `/stories/[id]/comments` and
   `/stories/[id]/reactions` are **not linked from any main page or navigation element**, so users
   cannot reach them through the product UI. `/users/[id]/followers` and `/users/[id]/following` ARE
   linked from the profile pages. A green contract test certifies the paths, not the product

### Risks retired by the refactor
| Retired risk | Why |
|---|---|
| **The backend could not start at all** | `BooksModule` ↔ `LibraryModule` formed a circular dependency with **no `forwardRef()`** on either side, and Nest aborted the whole graph: `The module at index [3] of the LibraryModule "imports" array is undefined`. `forwardRef()` is now on both — `books.module.ts:33`, `library.module.ts:24`. Retired 2026-10-04 |
| **`ContestsEventHandler` could not resolve `NotificationsService`** | `contests.module.ts` imported `NotificationsModule` but never listed it in `imports`, so the import was dead. Listed at `contests.module.ts:27`. Retired 2026-10-04 |
| **The integration suite reported green without running** | The two module bugs above made all **11** `backend/test/*.integration-spec.ts` files and the stories e2e **skip themselves** while CI stayed green. With the graph building, **8 previously-never-executed tests failed** on stale fixtures (categories/tags needed a content-moderator token, upload discarded its auth token, one spec targeted the deliberately deleted `POST /library`, the stories e2e assumed a draft appeared in the public list) and were fixed. Retired 2026-10-04 |
| **Migration data loss (Risk 7)** | Materially reduced: sha256 content-checksum ledger, per-migration transactions, and machine-read reversibility classification (`reversible` / `data-loss` / `irreversible`). ⚠️ **the previous version of this row claimed `0001` is deliberately irreversible because it owns `uuid-ossp` — that is false.** All 22 down scripts classify: **0 irreversible, 18 data-loss, 4 reversible** (`0014`, `0020`, `0021`, `0022`). `0001_create_stories_tables.down.sql` declares `reversibility=data-loss`. Corrected 2026-10-04 |
| **Dead-lettered events were never redelivered** | ⚠️ **this hazard was asserted in `phases/implementation-roadmap.md`, which claimed the DLQ "has no drain" and that a dead-lettered event "is never redelivered". That claim was false and is corrected there.** The drain exists: `DLQController` exposes `GET /events/dlq` and `POST /events/dlq/:id/replay`; `EventValidatorService.replayDeadLettered` re-validates the stored payload against its registered schema and re-emits it. `retryDLQ` — which deleted a now-valid entry without re-emitting it — is **deleted**. `getDLQStats` remains the one spec-only method on the path. Retired 2026-10-04 |
| **Documentation instructed readers to run a script that did not exist** | `npm run migration:status` was named in **8** documents under `docs/` (`grep -rln "npm run migration:status" docs/ \| wc -l` → 8) **from the repository root**, where the script did not exist — it was in `backend/package.json` only, so a reader following any of them got `Missing script`. It now exists at the root (`package.json:22`) and delegates to the backend. Retired 2026-10-04 |
| Unauthorised access to moderation stats | Closed: `@Secured()` wires `RolesGuard`, so `@RequireAdminRole` is no longer dead metadata |
| Rate limiting ineffective behind a load balancer | Closed: `ValkeyThrottlerStorage` shares counters across instances |
| Cache staleness with no invalidation strategy | Closed: cache-aside with tagged invalidation and hit-rate metrics at `GET /api/v1/metrics/cache` |
| Resilience primitives as dead code | Closed: `CircuitBreakerService` is injected into `auth.service.ts` and `sanity.service.ts`; `ResilientHttpClient` fronts the Paymob client |
| Payment gateway fabricating checkout URLs | Closed: `PaymobClient` fails cleanly with 503 and marks the local payment `failed` |
| Anonymous callers could dump every draft | Closed: `GET /stories` pins `status` to `published`; the two detail routes use `OptionalJwtAuthGuard` and return **404, not 403**, to anyone who is neither the author nor a `CONTENT_MODERATE` holder |
| Every web-client search was a 400 | Closed: `frontend/src/lib/api.ts` sent `q=` where `SearchFiltersDto` declares `query`, under `forbidNonWhitelisted`. The UI showed "no results" for everything |
| Every follow/react/comment from the web client was a 404 | Closed: twelve call sites corrected to the routes the controllers actually declare, pinned by a contract test (⛔ but the pages have no call sites — see item 8 above) |
| Muted comments still delivered comment-reaction notifications | Closed: the type is now `comment_reaction`, resolved through the single map in `notifications/preference-family.ts` |
| Read receipts were unmarkable over HTTP | Closed: `PATCH /messages/messages/:messageId/read` had a doubled path segment; it is now `PATCH /messages/:messageId/read` |

---

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| Decision points at Weeks 2, 5, 8, 11, 13, 15 — matching the abandoned 6-milestone/16-week model | Realigned to the canonical phase boundaries: **2, 5, 7, 10, 12, 13, 18**, with an actual go/no-go status per gate |
| Risk 3 "Start integration early (Week 10)" | Week 10 is correct under the canonical model ✅ |
| Risk 8 "Buffer week (Week 8)" | Week 8 is the start of Phase 4 under the canonical model ✅ |
| Risk 7 "Use transactions where possible" | Now literal: **every** migration is transaction-wrapped, plus a checksum ledger and reversibility classification |
| Risk 7 "Backup before migrations" | ⛔ There is no backup automation. `pg_dump` in a deployment docstring is the current practice; `docs/deployment/backup.md` describes an `nginx.conf` that does not exist and a `scripts/` directory that now contains `backup.sh` but is not scheduled |
| No status on any risk | Added a status column to the risk summary and to the decision-point table |
| — | Added **Risks retired by the refactor**, so the register does not keep warning about hazards that have been closed |
| Plan A assumed a deployable artifact | Marked explicitly as not achievable in the current state; Plan C is now identified as the plan that fits |

---

## Changelog — reconciliation (2026-10-04)

**This pass retires hazards rather than adding them.** A register that keeps warning about a closed
risk is as misleading as one that never recorded a live one, and this one had done both.

| Problem in this document | Resolution |
|---|---|
| **The two launch blockers were not in the register at all.** `BooksModule` ↔ `LibraryModule` had no `forwardRef()` and the backend could not boot; `ContestsModule` imported `NotificationsModule` without listing it | Added to the summary table as **retired risks** with the evidence and the fix locations, so the record of what they were is kept without the register continuing to flag them |
| The integration suite was reported as "23 files" green while **every one of those files was skipping itself** | Recorded as its own retired risk. The 11 specs ran for the first time; 8 then failed on stale fixtures and were fixed. ⚠️ the summary table never distinguished "green" from "executed", which is how a broken application shipped a green board |
| Risk 7's retired row claimed **`0001` is deliberately irreversible because it owns `uuid-ossp`** | ⛔ **False.** All 22 down scripts classify: **0 irreversible, 18 data-loss, 4 reversible** (`0014`, `0020`, `0021`, `0022`). `0001_create_stories_tables.down.sql` declares `reversibility=data-loss` |
| Frontend coverage published as **39.79** statements / **40.22** lines | **68.39 / 68.17** (`frontend/coverage/coverage-summary.json`). **All four were wrong** |
| The Week 18 decision list had no entry for the unwired social UI | Added as item 7 of "What blocks the Week 18 decision" — ⛔, not infrastructure. ⚠️ **Correction:** the duplicate contest notifications defect has since been **resolved** by removing the duplicate handler in `notifications.event-handler.ts` |
| The DLQ was nowhere in this register, though `implementation-roadmap.md` claimed it had **no drain** and never redelivered | Added to the retired table with the correction: the drain exists (`GET /events/dlq`, `POST /events/dlq/:id/replay`), `retryDLQ` is deleted, `getDLQStats` is the only spec-only method |
| Eight documents instructed readers to run `npm run migration:status` **from the repo root**, where the script did not exist | Recorded as a retired documentation hazard; the root script now exists (`package.json:22`) |
| Every retired-risk row cited only the "why" | Rows now carry the file and line where the fix landed, so each claim is checkable against the tree |

### Still open, and unchanged by this pass
No CI deploy workflow · backup script exists but is not automated · k6 config exists but is not run in
CI · no benchmark harness · no deployed alert rules · no WAF metrics or admin endpoints · frontend
coverage at ~68% · ⛔ **two social UI pages with no navigation call sites** (`/stories/[id]/comments`,
`/stories/[id]/reactions`).

---

*This document identifies risks for the Hakawi implementation.*
