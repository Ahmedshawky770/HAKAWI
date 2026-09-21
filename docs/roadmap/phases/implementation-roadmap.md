# Implementation Roadmap
## Hakawi - 20-Week Build Plan (Corrected)

---

## Testing Philosophy

**TDD is mandatory from Week 1.** Every feature is written using the Red-Green-Refactor cycle:
1. **Red** — Write a failing test
2. **Green** — Write minimal code to make it pass
3. **Refactor** — Improve code while keeping tests green

**Coverage Targets:**
- Auth/Payments: 90%
- Other modules: 80%
- E2E tests: All critical flows

---

## Phase 1: Foundation (Weeks 1-2)

### Week 1: Project Setup
- [ ] Initialize monorepo structure
- [ ] Set up NestJS backend
- [ ] Set up Next.js frontend
- [ ] Configure Docker Compose
- [ ] Set up CI/CD pipeline
- [ ] Set up testing framework (Jest, Supertest, Playwright)
- [ ] Write first tests (TDD from Day 1)

### Week 2: Core Infrastructure
- [ ] Database schema design
- [ ] Drizzle ORM setup
- [ ] Authentication module (TDD)
- [ ] Authorization module (TDD)
- [ ] WAF middleware (TDD)
- [ ] Logger setup
- [ ] Event Bus setup (EventEmitter2)

**Exit Criteria:**
- ✅ All tests pass (unit + integration)
- ✅ Code coverage ≥ 80%
- ✅ Auth flow works end-to-end
- ✅ Database connected and migrations run
- ✅ Docker Compose runs locally

**Deliverables:**
- Running development environment
- Database schema
- Auth system working
- Basic logging and monitoring
- Test suite configured

---

## Phase 2: Core Domain (Weeks 3-5)

### Week 3: Users Module (TDD)
- [ ] User CRUD operations
- [ ] Profile management
- [ ] User statistics
- [ ] Verification system
- [ ] **Unit tests** (users.service.spec.ts)
- [ ] **Integration tests** (users.controller.spec.ts)

### Week 4: Stories Module (TDD)
- [ ] Story CRUD operations
- [ ] Sanity CMS integration
- [ ] Story publishing workflow
- [ ] Search integration (PostgreSQL full-text)
- [ ] **Unit tests** (stories.service.spec.ts)
- [ ] **Integration tests** (stories.controller.spec.ts)

### Week 5: Content Management (TDD)
- [ ] Categories and tags
- [ ] Story status workflow
- [ ] Content moderation hooks
- [ ] Image upload (R2/S3)
- [ ] **Unit tests** (categories.service.spec.ts)
- [ ] **Integration tests** (stories E2E)

**Exit Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Code coverage ≥ 80%
- ✅ Users can register and login
- ✅ Writers can create and publish stories
- ✅ Stories are searchable

**Deliverables:**
- Users module complete
- Stories module complete
- Sanity CMS integrated
- Search working

---

## Phase 3: Social Features (Weeks 6-7)

### Week 6: Interactions (TDD)
- [ ] Follow/unfollow system
- [ ] Reactions (6 types)
- [ ] Comments with replies
- [ ] Comment reactions
- [ ] **Unit tests** (reactions, comments)
- [ ] **Integration tests** (follow, reactions)

### Week 7: Notifications & Messages (TDD)
- [ ] Notification system
- [ ] Notification preferences
- [ ] Direct messaging
- [ ] Conversations
- [ ] **Unit tests** (notifications, messages)
- [ ] **Integration tests** (notifications, messages)

**Exit Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Code coverage ≥ 80%
- ✅ Users can follow each other
- ✅ Users can react to stories
- ✅ Users can comment
- ✅ Users can message each other

**Deliverables:**
- Social interactions complete
- Notifications working
- Messaging working

---

## Phase 4: Books & Commerce (Weeks 8-10)

### Week 8: Books Module (TDD)
- [ ] Book CRUD operations
- [ ] PDF upload (R2/S3)
- [ ] Book details page
- [ ] Reading progress tracking
- [ ] **Unit tests** (books.service.spec.ts)
- [ ] **Integration tests** (books.controller.spec.ts)

### Week 9: Sales & Rentals (TDD)
- [ ] Book sales system
- [ ] Book rental system (1d, 3d, 1w, 2w, 1m, 3m)
- [ ] Rental extensions
- [ ] User library
- [ ] **Unit tests** (rentals.service.spec.ts)
- [ ] **Integration tests** (purchase, rental)

### Week 10: Payments - Integration (TDD)
- [ ] Paymob integration
- [ ] Payment initiation
- [ ] Payment webhook handling
- [ ] Idempotent webhook processing
- [ ] Payment state machine
- [ ] **Unit tests** (payments.service.spec.ts)
- [ ] **Integration tests** (payment flows)
- [ ] **E2E tests** (payment flows with Playwright)

**Exit Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Payment E2E tests pass (purchase, rental, refund)
- ✅ Code coverage ≥ 90% (critical module)
- ✅ Webhook idempotency tested
- ✅ Payment state machine tested
- ✅ Books can be sold and rented

**Deliverables:**
- Books module complete
- Sales and rentals working
- Payments fully integrated
- Payment E2E tests passing

---

## Phase 5: Contests (Weeks 11-12)

### Week 11: Contest System (TDD)
- [ ] Contest creation
- [ ] Submission system
- [ ] Voting system
- [ ] Winner selection
- [ ] **Unit tests** (contests.service.spec.ts)
- [ ] **Integration tests** (contests.controller.spec.ts)

### Week 12: Contest Features (TDD)
- [ ] Prize distribution
- [ ] Badge awards
- [ ] Contest notifications
- [ ] Publisher dashboard
- [ ] **Unit tests** (prizes, badges)
- [ ] **Integration tests** (contest flows)

**Exit Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Code coverage ≥ 85%
- ✅ Publishers can create contests
- ✅ Users can submit entries
- ✅ Winners can be selected
- ✅ Prizes distributed

**Deliverables:**
- Contest system complete
- Prize distribution working
- Publisher dashboard complete

---

## Phase 6: Moderation (Week 13)

### Week 13: Moderation System (TDD)
- [ ] Reporting system
- [ ] Auto-escalation
- [ ] Moderation actions
- [ ] User restrictions
- [ ] Admin dashboard
- [ ] **Unit tests** (moderation.service.spec.ts)
- [ ] **Integration tests** (moderation.controller.spec.ts)

**Exit Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Code coverage ≥ 80%
- ✅ Content can be reported
- ✅ Moderators can take action
- ✅ Users can be restricted

**Deliverables:**
- Moderation system complete
- Admin dashboard complete

---

## Phase 7: Polish & Launch (Weeks 14-18)

### Week 14: Testing & Optimization
- [ ] **Unit tests** — 80-90% coverage
- [ ] **Integration tests** — All modules
- [ ] **E2E tests** — All critical flows
- [ ] Performance optimization
- [ ] Security audit
- [ ] Load testing (1000 concurrent users)
- [ ] Payment flow testing (sandbox)

### Week 15: Event Schema Registry
- [ ] Implement event schema registry
- [ ] Add Dead Letter Queue (DLQ)
- [ ] Event versioning
- [ ] Event validation
- [ ] **Unit tests** (event bus)

### Week 16: Read Replicas & Resilience
- [ ] Set up read replica
- [ ] Implement read/write splitting
- [ ] Monitor replication lag
- [ ] Circuit breakers for external services
- [ ] Retry logic with exponential backoff
- [ ] Timeout configuration
- [ ] Fallback strategies
- [ ] **Integration tests** (replica routing, circuit breakers)

### Week 17: Documentation & Deployment
- [ ] API documentation (OpenAPI)
- [ ] Deployment guides
- [ ] User documentation
- [ ] Production deployment
- [ ] Monitoring setup (Sentry, Winston)
- [ ] Backup strategy implemented

### Week 18: Final Testing & Launch
- [ ] Full regression testing
- [ ] Security penetration testing
- [ ] Performance benchmarking
- [ ] Load testing
- [ ] Staging deployment
- [ ] Production deployment
- [ ] Post-launch monitoring

**Exit Criteria:**
- ✅ All tests pass (unit, integration, E2E)
- ✅ Code coverage ≥ 80%
- ✅ Payment E2E tests pass
- ✅ Performance targets met (< 200ms p95)
- ✅ Security audit passed
- ✅ Load testing passed (1000 concurrent users)
- ✅ Monitoring dashboards active
- ✅ Backup strategy implemented

**Deliverables:**
- Production-ready application
- Full test coverage
- Complete documentation
- Live deployment
- Monitoring and alerting

---

## Milestones

| Milestone | Week | Deliverable | Exit Criteria |
|-----------|------|-------------|---------------|
| **M1: Foundation** | 2 | Auth + Database + Infrastructure | Tests passing, coverage ≥ 80% |
| **M2: Core Content** | 5 | Users + Stories + Search | Stories can be published |
| **M3: Social** | 7 | Interactions + Notifications + Messages | Social features working |
| **M4: Books & Sales** | 9 | Books + Sales + Rentals | Books can be purchased |
| **M5: Payments** | 10 | Payment integration + E2E | Payment flows tested |
| **M6: Contests** | 12 | Contest system complete | Contests working |
| **M7: Moderation** | 13 | Moderation system | Content moderation working |
| **M8: Production** | 18 | Fully tested and deployed | All exit criteria met |

---

## Phase Exit Criteria (NFR Checklist)

Each phase must meet these criteria before proceeding:

| NFR | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 |
|-----|---------|---------|---------|---------|---------|---------|---------|
| **Code coverage ≥ 80%** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **All tests pass** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **No critical bugs** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **API response < 200ms (p95)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Security audit passed** | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ✅ | ✅ |
| **Performance tests passed** | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ✅ |
| **Load testing passed** | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ⏭️ | ✅ |
| **Monitoring configured** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Backup strategy implemented** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Circuit breakers configured** | ⏭️ | ⏭️ | ⏭️ | ✅ | ✅ | ✅ | ✅ |

**Legend:**
- ✅ Required for this phase
- ⏭️ Deferred to later phase

---

## Critical Path (High-Risk Items)

### Payment Integration (Weeks 10-11)

**Risk:** High — External dependency, financial transactions

**Mitigation:**
- Start sandbox testing in Week 10
- Implement idempotent webhook handling
- Add comprehensive E2E tests
- Monitor webhook success rate
- Have rollback plan ready

**Dependencies:**
- Paymob sandbox account (set up in Week 9)
- Webhook endpoint deployed
- Payment state machine tested

### Sanity CMS Integration (Week 4)

**Risk:** Medium — External dependency, content management

**Mitigation:**
- Early integration in Week 4
- Fallback to PostgreSQL if Sanity unavailable
- Daily backup of Sanity content
- Monitor webhook success rate

**Dependencies:**
- Sanity account set up
- GROQ queries tested
- Webhook endpoint deployed

### Testing (All Phases)

**Risk:** High — Quality assurance, time-consuming

**Mitigation:**
- TDD from Week 1 (no exceptions)
- 80% coverage minimum
- E2E tests for all critical flows
- CI/CD runs all tests on every PR
- Payment E2E tests in Week 11

**Dependencies:**
- Test framework set up in Week 1
- Test data seeded
- CI/CD pipeline configured

---

## Risk Management

| Risk | Probability | Impact | Mitigation | Phase |
|------|-------------|--------|-----------|-------|
| **Payment gateway issues** | Low | High | Comprehensive testing, sandbox mode, idempotency | Week 10 |
| **Sanity CMS integration complexity** | Medium | High | Early integration, fallback to PostgreSQL, webhooks | Week 4 |
| **Performance bottlenecks** | Medium | Medium | Load testing, caching strategy, read replicas | Week 14-18 |
| **Security vulnerabilities** | Low | High | Security audit, penetration testing, WAF | Week 14-18 |
| **Testing delays** | Medium | High | TDD from Week 1, CI/CD automation | All phases |
| **Scope creep** | High | Medium | Strict phase boundaries, no new features mid-phase | All phases |

---

## Success Criteria

### Functionality
- ✅ All core features working
- ✅ Payment flows tested and working
- ✅ Sanity CMS integrated
- ✅ Search working
- ✅ Notifications working
- ✅ Messaging working

### Performance
- ✅ Page load < 3s
- ✅ API response < 200ms (p95)
- ✅ Cache hit rate > 90%
- ✅ Database query < 50ms (p95)

### Security
- ✅ Pass security audit
- ✅ No critical vulnerabilities
- ✅ WAF configured
- ✅ Rate limiting active
- ✅ Encryption at rest and in transit

### Quality
- ✅ Code coverage ≥ 80%
- ✅ All tests pass (unit, integration, E2E)
- ✅ Payment E2E tests pass
- ✅ No critical bugs
- ✅ Code review coverage 100%

### Reliability
- ✅ Uptime > 99.9%
- ✅ Backup strategy implemented
- ✅ Monitoring configured
- ✅ Alerting configured
- ✅ Disaster recovery plan documented

### Documentation
- ✅ API documentation complete
- ✅ Architecture documentation complete
- ✅ Deployment guides complete
- ✅ User documentation complete

---

## Timeline Summary

```
Phase 1: Foundation         (Weeks 1-2)   ← Auth, Database, Infrastructure
Phase 2: Core Domain        (Weeks 3-5)   ← Users, Stories, Search
Phase 3: Social Features    (Weeks 6-7)   ← Interactions, Notifications, Messages
Phase 4: Books & Commerce   (Weeks 8-10)  ← Books, Sales, Rentals, Payments
Phase 5: Contests           (Weeks 11-12) ← Contest system
Phase 6: Moderation         (Week 13)     ← Moderation system
Phase 7: Polish & Launch    (Weeks 14-18) ← Testing, Optimization, Deployment
```

**Total: 18 weeks (4.5 months)**

---

## Post-Launch Roadmap

### Month 6: Optimization
- Performance optimization based on real usage
- Cache tuning
- Database query optimization
- Read replica scaling

### Month 7: Features
- PWA support
- Mobile app (React Native)
- Advanced analytics
- Recommendation engine

### Month 8: Scale
- Microservices extraction (if needed)
- Multi-region deployment
- CDN for static assets
- Advanced monitoring (Prometheus, Grafana)

---

## Related Documentation

- Testing Strategy: `testing/testing-strategy.md`
- Event Schema Registry: `module-boundaries/events/event-schema-registry.md`
- Read Replica Strategy: `system-architecture/infrastructure/read-replicas.md`
- NFRs: `system-architecture/non-functional-requirements.md`
- Payment System: `module-boundaries/payments/payment-system.md`

---

*This document defines the implementation roadmap for Hakawi. All phases have clear exit criteria and success metrics. TDD is mandatory from Week 1.*
