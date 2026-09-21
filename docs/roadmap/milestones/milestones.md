# Milestones
## Hakawi Implementation Roadmap

This document defines milestone criteria, verification steps, and exit conditions for each phase of the Hakawi implementation.

---

## Milestone Overview

| Milestone | Phase | Duration | Key Deliverable |
|-----------|-------|----------|-----------------|
| M1 | Foundation | Weeks 1-2 | Auth + Database + Infrastructure |
| M2 | Core Content | Weeks 3-5 | Users + Stories + Search |
| M3 | Social | Weeks 6-7 | Interactions + Notifications + Messages |
| M4 | Commerce | Weeks 9-11 | Books + Sales + Rentals + Payments |
| M5 | Contests | Weeks 12-13 | Contest system complete |
| M6 | Production | Weeks 14-16 | Fully tested and deployed |

---

## M1: Foundation (Weeks 1-2)

### Objective
Establish project foundation with authentication, database, and basic infrastructure.

### Deliverables
- [ ] Monorepo structure initialized
- [ ] NestJS backend with basic modules
- [ ] Next.js frontend with basic pages
- [ ] PostgreSQL database configured
- [ ] Valkey cache configured
- [ ] Docker Compose for local development
- [ ] CI/CD pipeline configured

### Acceptance Criteria
1. **Project Structure**
   - Monorepo with frontend and backend directories
   - Shared types package
   - Docker Compose file for local development

2. **Backend**
   - NestJS application starts without errors
   - Health check endpoint responds
   - Database connection established
   - Cache connection established

3. **Frontend**
   - Next.js application starts without errors
   - Basic routing works
   - Can connect to backend API

4. **Database**
   - All tables created via migrations
   - Seed data loaded
   - Connection pooling configured

5. **CI/CD**
   - GitHub Actions workflow runs on PR
   - Linting passes
   - TypeScript compilation passes
   - Tests run

### Verification Steps
```bash
# 1. Start Docker Compose
docker-compose up -d

# 2. Run migrations
npm run migration:run

# 3. Seed database
npm run seed:dev

# 4. Start backend
cd backend && npm run start:dev

# 5. Start frontend
cd frontend && npm run dev

# 6. Verify health
curl http://localhost:3000/health

# 7. Run tests
npm test
```

### Exit Conditions
- All acceptance criteria met
- No critical bugs
- Documentation updated
- Team sign-off

---

## M2: Core Content (Weeks 3-5)

### Objective
Implement core content features: users, stories, and search.

### Deliverables
- [ ] User registration and login
- [ ] User profile management
- [ ] Story CRUD operations
- [ ] Story publishing workflow
- [ ] Sanity CMS integration
- [ ] Basic search functionality

### Acceptance Criteria
1. **User Management**
   - Users can register with email/password
   - Users can login with OAuth providers
   - Users can update their profile
   - Users can view their statistics

2. **Story Management**
   - Writers can create stories
   - Writers can edit their stories
   - Writers can publish stories
   - Published stories are visible to readers
   - Stories are synced with Sanity

3. **Search**
   - Users can search stories by title
   - Users can filter by category
   - Search results are paginated
   - Search is case-insensitive

### Verification Steps
```bash
# 1. Register new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","name":"Test","username":"testuser"}'

# 2. Create story
curl -X POST http://localhost:3000/api/v1/stories \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Story","content":"<p>Content</p>","category":"fiction"}'

# 3. Publish story
curl -X POST http://localhost:3000/api/v1/stories/<id>/publish \
  -H "Authorization: Bearer <token>"

# 4. Search stories
curl "http://localhost:3000/api/v1/stories?q=Test"
```

### Exit Conditions
- All user flows work end-to-end
- Stories are searchable
- Sanity sync is working
- No critical bugs

---

## M3: Social (Weeks 6-7)

### Objective
Implement social features: follows, reactions, comments, notifications, and messages.

### Deliverables
- [ ] Follow/unfollow system
- [ ] Story reactions (6 types)
- [ ] Comments with replies
- [ ] Comment reactions
- [ ] Notification system
- [ ] Direct messaging

### Acceptance Criteria
1. **Follow System**
   - Users can follow/unfollow other users
   - Follower counts are updated
   - Followers are listed on profile

2. **Reactions**
   - Users can react to stories (6 types)
   - Reaction counts are displayed
   - Users can change their reaction

3. **Comments**
   - Users can comment on stories
   - Users can reply to comments
   - Comments are threaded
   - Comment counts are displayed

4. **Notifications**
   - Users receive notifications for follows, reactions, comments
   - Notifications are marked as read
   - Notification preferences work

5. **Messages**
   - Users can send messages
   - Conversations are listed
   - Messages are real-time (or near real-time)

### Verification Steps
```bash
# 1. Follow user
curl -X POST http://localhost:3000/api/v1/users/<id>/follow \
  -H "Authorization: Bearer <token>"

# 2. Add reaction
curl -X POST http://localhost:3000/api/v1/stories/<id>/reactions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"love"}'

# 3. Add comment
curl -X POST http://localhost:3000/api/v1/stories/<id>/comments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Great story!"}'

# 4. Get notifications
curl http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer <token>"

# 5. Send message
curl -X POST http://localhost:3000/api/v1/messages/conversations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"recipientId":"<id>","content":"Hello!"}'
```

### Exit Conditions
- All social features work
- Notifications are delivered
- Messages are sent/received
- Real-time updates work (if implemented)

---

## M4: Commerce (Weeks 9-11)

### Objective
Implement books, sales, rentals, and payment processing.

### Deliverables
- [ ] Book CRUD operations
- [ ] Book sales system
- [ ] Book rental system
- [ ] User library
- [ ] Paymob integration
- [ ] Payment webhooks

### Acceptance Criteria
1. **Books**
   - Authors can create books
   - Books have cover image and PDF
   - Books are listed in catalog

2. **Sales**
   - Users can purchase books
   - Payments are processed via Paymob
   - Purchase history is recorded
   - Users get access to purchased books

3. **Rentals**
   - Users can rent books
   - Rental periods are enforced
   - Rentals can be extended
   - Access is revoked on expiry

4. **Library**
   - Users can view their library
   - Purchased books are permanent
   - Rented books are time-limited
   - Reading progress is tracked

### Verification Steps
```bash
# 1. Create book
curl -X POST http://localhost:3000/api/v1/books \
  -H "Authorization: Bearer <token>" \
  -F "title=My Book" \
  -F "pdf=@book.pdf"

# 2. Purchase book
curl -X POST http://localhost:3000/api/v1/books/<id>/purchase \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethodId":"pm_123"}'

# 3. Rent book
curl -X POST http://localhost:3000/api/v1/books/<id>/rent \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"duration":"one_week","paymentMethodId":"pm_123"}'

# 4. View library
curl http://localhost:3000/api/v1/library \
  -H "Authorization: Bearer <token>"
```

### Exit Conditions
- Books can be sold
- Payments process successfully
- Rentals work with extensions
- Library is accurate

---

## M5: Contests (Weeks 12-13)

### Objective
Implement contest system with submissions, voting, and prizes.

### Deliverables
- [ ] Contest creation
- [ ] Submission system
- [ ] Voting system
- [ ] Winner selection
- [ ] Prize distribution
- [ ] Contest notifications

### Acceptance Criteria
1. **Contest Management**
   - Publishers can create contests
   - Contests have start/end dates
   - Contests have submission deadlines

2. **Submissions**
   - Authors can submit stories
   - Submissions are reviewed
   - Approved submissions enter voting

3. **Voting**
   - Community can vote
   - Vote counts are tracked
   - One vote per user per submission

4. **Winner Selection**
   - Publisher can select winner
   - Winner receives badge
   - Prize is distributed

### Verification Steps
```bash
# 1. Create contest
curl -X POST http://localhost:3000/api/v1/contests \
  -H "Authorization: Bearer <publisher_token>" \
  -H "Content-Type: application/json" \
   -d '{"title":"Contest","category":"fiction","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}'

# 2. Submit entry
curl -X POST http://localhost:3000/api/v1/contests/<id>/submit \
  -H "Authorization: Bearer <author_token>" \
  -H "Content-Type: application/json" \
  -d '{"storyId":"<story_id>"}'

# 3. Vote
curl -X POST http://localhost:3000/api/v1/contests/<id>/vote \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"submissionId":"<submission_id>"}'

# 4. Select winner
curl -X POST http://localhost:3000/api/v1/contests/<id>/winner \
  -H "Authorization: Bearer <publisher_token>" \
  -H "Content-Type: application/json" \
  -d '{"submissionId":"<submission_id>"}'
```

### Exit Conditions
- Contests can be created
- Submissions work
- Voting works
- Winners can be selected
- Prizes are distributed

---

## M6: Production (Weeks 14-16)

### Objective
Complete moderation, testing, optimization, and deploy to production.

### Deliverables
- [ ] Moderation system
- [ ] Reporting system
- [ ] Comprehensive tests
- [ ] Performance optimization
- [ ] Security audit
- [ ] Production deployment

### Acceptance Criteria
1. **Moderation**
   - Users can report content
   - Moderators can take action
   - Auto-escalation works
   - User restrictions work

2. **Testing**
   - Unit tests > 80% coverage
   - Integration tests pass
   - E2E tests pass for critical flows

3. **Performance**
   - Page load < 3s
   - API response < 500ms
   - Cache hit rate > 70%

4. **Security**
   - Security audit passed
   - No critical vulnerabilities
   - WAF rules tuned

### Verification Steps
```bash
# 1. Run all tests
npm test
npm run test:e2e

# 2. Check coverage
npm run test:coverage

# 3. Security audit
npm audit
npm run security:scan

# 4. Performance test
npm run test:perf

# 5. Deploy to staging
npm run deploy:staging

# 6. Smoke tests
npm run test:smoke
```

### Exit Conditions
- All tests pass
- No critical bugs
- Performance meets targets
- Security audit passed
- Production deployed
- Monitoring configured

---

## Milestone Gates

### Gate Criteria
Each milestone requires:
1. All acceptance criteria met
2. All tests passing
3. No critical bugs
4. Documentation updated
5. Team sign-off

### Blockers
If a milestone is not met:
1. Document blockers
2. Assess impact on next milestone
3. Adjust timeline if needed
4. Communicate to stakeholders

---

*This document defines milestones for the Hakawi implementation.*
