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
| Team availability | Low | High | Cross-training, documentation | ✅ — `docs/` reconciled 2026-09-30 |
| **No deployment artifact** | High | High | Build a `Dockerfile` + manifest | ⛔ **Unmitigated — the single biggest launch blocker** |
| **No backup automation** | Medium | High | Scheduled `pg_dump` + PITR | ⛔ **Unmitigated — nothing to restore from** |
| **No load/performance testing** | High | Medium | k6 or Artillery suite | ⛔ **Unmitigated — every p95 target is unmeasured** |
| **No alerting** | Medium | High | Define alert rules on the metrics that exist | ⛔ **Unmitigated — Sentry is wired, nothing pages** |

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
| 18 | Phase 7: Polish & Launch | Tested, measured, deployed, backed up, alerting? | ⛔ **No-go** — load testing, benchmarking, a deployment artifact, backup automation, and alerting are all unbuilt |

### What blocks the Week 18 decision
1. No `Dockerfile` or deployment artifact of any kind
2. No load test or performance benchmark — the p95 targets have never been measured
3. No backup automation, so there is nothing to restore from
4. No alert rules
5. No WAF metrics endpoint or WAF admin operations endpoints
6. Frontend coverage at 44.25 statements/lines, against an 80% target

### Risks retired by the refactor
| Retired risk | Why |
|---|---|
| Migration data loss (Risk 7) | Materially reduced: sha256 content-checksum ledger, per-migration transactions, and machine-read reversibility classification (`reversible` / `data-loss` / `irreversible`), with `0001` deliberately irreversible because it owns `uuid-ossp`. See `docs/data-architecture/migrations/migration-strategy.md` |
| Unauthorised access to moderation stats | Closed: `@Secured()` wires `RolesGuard`, so `@RequireAdminRole` is no longer dead metadata |
| Rate limiting ineffective behind a load balancer | Closed: `ValkeyThrottlerStorage` shares counters across instances |
| Cache staleness with no invalidation strategy | Closed: cache-aside with tagged invalidation and hit-rate metrics at `GET /api/v1/metrics/cache` |
| Resilience primitives as dead code | Closed: `CircuitBreakerService` is injected into `auth.service.ts` and `sanity.service.ts`; `ResilientHttpClient` fronts the Paymob client |
| Payment gateway fabricating checkout URLs | Closed: `PaymobClient` fails cleanly with 503 and marks the local payment `failed` |

---

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| Decision points at Weeks 2, 5, 8, 11, 13, 15 — matching the abandoned 6-milestone/16-week model | Realigned to the canonical phase boundaries: **2, 5, 7, 10, 12, 13, 18**, with an actual go/no-go status per gate |
| Risk 3 "Start integration early (Week 10)" | Week 10 is correct under the canonical model ✅ |
| Risk 8 "Buffer week (Week 8)" | Week 8 is the start of Phase 4 under the canonical model ✅ |
| Risk 7 "Use transactions where possible" | Now literal: **every** migration is transaction-wrapped, plus a checksum ledger and reversibility classification |
| Risk 7 "Backup before migrations" | ⛔ There is no backup automation. `pg_dump` in a deployment docstring is the current practice; `docs/deployment/backup.md` describes an `nginx.conf` and `scripts/` directory that do not exist |
| No status on any risk | Added a status column to the risk summary and to the decision-point table |
| — | Added **Risks retired by the refactor**, so the register does not keep warning about hazards that have been closed |
| Plan A assumed a deployable artifact | Marked explicitly as not achievable in the current state; Plan C is now identified as the plan that fits |

---

*This document identifies risks for the Hakawi implementation.*
