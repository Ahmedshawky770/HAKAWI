# Testing Strategy
## Hakawi - Testing Pyramid and Guidelines

---

## Testing Pyramid

```
        ┌─────────┐
        │   E2E   │ 10% - Critical user flows
        ├─────────┤
        │   INT   │ 20% - Module integration
        ├─────────┤
        │   UNIT  │ 70% - Services, utilities, pure functions
        └─────────┘
```

---

## Unit Tests (70%)

### Scope

- Services
- Utilities
- Pure functions
- Domain logic
- Validators

### Tools

- **Jest** — test runner and assertions
- **@nestjs/testing** — NestJS testing utilities

### Example

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let repository: MockType<UsersRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repository = module.get(UsersRepository);
  });

  it('should find user by id', async () => {
    const user = { id: '1', name: 'Test' };
    jest.spyOn(repository, 'findById').mockResolvedValue(user);

    const result = await service.findById('1');
    expect(result).toEqual(user);
  });

  it('should throw NotFoundException when user not found', async () => {
    jest.spyOn(repository, 'findById').mockResolvedValue(null);

    await expect(service.findById('1')).rejects.toThrow(NotFoundException);
  });
});
```

### Coverage Target

- **Minimum:** 80% coverage
- **Target:** 90% coverage for critical modules (auth, payments)

---

## Integration Tests (20%)

### Scope

- API endpoints
- Database operations
- Module interactions
- External API integrations

### Tools

- **Jest** — test runner
- **Supertest** — HTTP assertions
- **TestContainers** — database tests (optional)
- **@nestjs/testing** — NestJS testing utilities

### Example

```typescript
describe('UsersController (integration)', () => {
  let app: INestApplication;
  let repository: UsersRepository;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    repository = moduleFixture.get<UsersRepository>(UsersRepository);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await repository.deleteMany({});
  });

  it('POST /users — should create user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.email).toBe('test@example.com');
  });

  it('GET /users/:id — should return 404 when user not found', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/999')
      .expect(404);
  });
});
```

### Database Testing

```typescript
// Use test database
beforeAll(async () => {
  await db.connect('postgresql://localhost:5432/hakawi_test');
});

afterEach(async () => {
  await db.deleteFrom('users').execute();
});

afterAll(async () => {
  await db.disconnect();
});
```

---

## E2E Tests (10%)

### Scope

- Critical user flows
- Authentication flows
- Purchase flows
- Contest flows
- Messaging flows

### Tools

- **Playwright** — E2E testing
- **@playwright/test** — test runner

### Critical Flows to Test

1. **Authentication**
   - User registration
   - User login
   - OAuth login
   - Token refresh
   - Logout

2. **Story Management**
   - Create story
   - Publish story
   - View story
   - Search stories

3. **Social Features**
   - Follow user
   - Like story
   - Comment on story
   - Send message

4. **Commerce**
   - Purchase book
   - Rent book
   - View library

5. **Contests**
   - Create contest (publisher)
   - Submit entry
   - Vote for entry
   - Select winner

### Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should register new user', async ({ page }) => {
    await page.goto('http://localhost:3000/register');

    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="name"]', 'Test User');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'SecurePass123!');

    await page.click('[data-testid="register-button"]');

    // Should redirect to onboarding or feed
    await expect(page).toHaveURL(/.*(feed|onboarding)/);
  });

  test('should login with OAuth', async ({ page }) => {
    await page.goto('http://localhost:3000/login');

    await page.click('[data-testid="google-login"]');

    // OAuth flow handled by Google
    // Should redirect back to app
    await page.waitForURL(/.*feed/, { timeout: 30000 });
  });
});

test.describe('Story Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('http://localhost:3000/login');
    // ... login steps
  });

  test('should create and publish story', async ({ page }) => {
    await page.goto('http://localhost:3000/stories/create');

    await page.fill('[data-testid="title"]', 'Test Story');
    await page.fill('[data-testid="content"]', 'Once upon a time...');
    await page.selectOption('[data-testid="category"]', 'fiction');

    await page.click('[data-testid="publish-button"]');

    // Should show success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  });
});
```

### E2E Best Practices

1. **Use data-testid attributes** for selectors
2. **Wait for elements** before interacting
3. **Avoid hardcoded waits** — use `waitForSelector`
4. **Clean up test data** after each test
5. **Run in headless mode** in CI

---

## Test Organization

### File Structure

```
backend/
├── src/
│   ├── modules/
│   │   ├── users/
│   │   │   ├── users.service.ts
│   │   │   ├── users.service.spec.ts          # Unit tests
│   │   │   ├── users.controller.ts
│   │   │   └── users.controller.spec.ts       # Integration tests
│   │   └── payments/
│   │       ├── payments.service.ts
│   │       └── payments.service.spec.ts
│   └── test/
│       ├── e2e/                               # E2E tests
│       │   ├── auth.e2e-spec.ts
│       │   ├── stories.e2e-spec.ts
│       │   └── payments.e2e-spec.ts
│       └── jest-e2e.json                      # E2E config
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run test:cov
      - run: npm run test:cov:check  # Fail if coverage < 80%

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: docker-compose up -d
      - run: npm install
      - run: npm run test:e2e
```

---

## Test Data

### Seeds for Testing

```typescript
// backend/src/seeds/test.seed.ts
export async function run() {
  await db.insert(users).values([
    {
      id: 'test-user-1',
      email: 'test1@hakawi.com',
      name: 'Test User 1',
      accountType: 'reader',
    },
    {
      id: 'test-user-2',
      email: 'test2@hakawi.com',
      name: 'Test User 2',
      accountType: 'writer',
    },
  ]);
}
```

### Test Fixtures

```typescript
// backend/src/test/fixtures/users.fixture.ts
export const testUser = {
  id: 'test-user-1',
  email: 'test@example.com',
  name: 'Test User',
  accountType: 'reader' as const,
};

export const testWriter = {
  id: 'test-writer-1',
  email: 'writer@example.com',
  name: 'Test Writer',
  accountType: 'writer' as const,
};
```

---

## Mocking

### External APIs

```typescript
jest.mock('@payments/paymob');

const mockPaymobService = {
  createPayment: jest.fn(),
  processWebhook: jest.fn(),
};
```

### Database

```typescript
const mockRepository = {
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
```

---

## Coverage Requirements

| Module | Coverage Target |
|--------|----------------|
| **Auth** | 90% |
| **Payments** | 90% |
| **Users** | 85% |
| **Stories** | 85% |
| **Other modules** | 80% |

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# With coverage
npm run test:cov

# Watch mode
npm run test:watch
```

---

## Best Practices

1. **Test behavior, not implementation** — test what the code does, not how
2. **Arrange-Act-Assert** — structure tests clearly
3. **One assertion per test** — or related assertions
4. **Descriptive test names** — `should throw NotFoundException when user not found`
5. **Avoid test interdependence** — each test should be independent
6. **Clean up after tests** — reset database, mock calls
7. **Use factories** — create test data with factories, not hardcoded values

---

## TDD (Test-Driven Development) Approach

### Philosophy

**TDD is mandatory from Week 1.** All code must be written using the Red-Green-Refactor cycle:

1. **Red** — Write a failing test
2. **Green** — Write minimal code to make it pass
3. **Refactor** — Improve code while keeping tests green

### TDD Workflow

```typescript
// 1. RED: Write failing test
describe('UsersService', () => {
  it('should hash password before saving', async () => {
    const user = await service.create({
      email: 'test@example.com',
      password: 'SecurePass123!',
    });
    
    expect(user.password).not.toBe('SecurePass123!');
    expect(await bcrypt.compare('SecurePass123!', user.password)).toBe(true);
  });
});

// 2. GREEN: Write minimal code
async create(createUserDto: CreateUserDto) {
  const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
  return this.repository.create({ ...createUserDto, password: hashedPassword });
}

// 3. REFACTOR: Improve code
async create(createUserDto: CreateUserDto) {
  const hashedPassword = await this.passwordHasher.hash(createUserDto.password);
  return this.repository.create({ ...createUserDto, password: hashedPassword });
}
```

### TDD Rules

1. **No code without a test** — Every feature must have a test first
2. **Test behavior, not implementation** — Test what the code does, not how
3. **One assertion per test** — Or related assertions
4. **Fast feedback** — Unit tests must run in < 100ms
5. **Independent tests** — Each test can run alone

### TDD by Module

| Module | TDD Required | Priority |
|--------|--------------|----------|
| **Auth** | ✅ Mandatory | Critical |
| **Payments** | ✅ Mandatory | Critical |
| **Users** | ✅ Mandatory | High |
| **Stories** | ✅ Mandatory | High |
| **Books** | ✅ Mandatory | High |
| **Contests** | ✅ Mandatory | Medium |
| **Notifications** | ✅ Mandatory | Medium |
| **Messages** | ✅ Mandatory | Medium |
| **Search** | ✅ Mandatory | Medium |
| **Moderation** | ✅ Mandatory | Low |

---

## Payment E2E Tests (Critical)

### Why Payment E2E Tests are Critical

Payment flows involve:
- External API (Paymob)
- Webhooks
- Database transactions
- User experience

Any failure in payment flow has **high business impact**.

### Payment E2E Test Scenarios

#### 1. Book Purchase Flow

```typescript
test.describe('Book Purchase Flow', () => {
  test('should purchase book successfully', async ({ page }) => {
    // 1. Login as user
    await page.goto('http://localhost:3000/login');
    await page.fill('[data-testid="email"]', 'buyer@example.com');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.click('[data-testid="login-button"]');
    
    // 2. Navigate to book
    await page.goto('http://localhost:3000/books/book-123');
    
    // 3. Click purchase button
    await page.click('[data-testid="purchase-button"]');
    
    // 4. Complete payment (sandbox)
    await page.waitForURL(/.*payment/);
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="expiry"]', '12/25');
    await page.fill('[data-testid="cvc"]', '123');
    await page.click('[data-testid="pay-button"]');
    
    // 5. Verify success
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page).toHaveURL(/.*library/);
    
    // 6. Verify book in library
    await expect(page.locator('[data-testid="book-item"]')).toHaveCount(1);
  });

  test('should handle payment failure gracefully', async ({ page }) => {
    // Similar flow but with declined card
    await page.fill('[data-testid="card-number"]', '4000000000000002'); // Declined
    await page.click('[data-testid="pay-button"]');
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Payment declined');
  });
});
```

#### 2. Book Rental Flow

```typescript
test.describe('Book Rental Flow', () => {
  test('should rent book for 1 week', async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('[data-testid="email"]', 'renter@example.com');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to book
    await page.goto('http://localhost:3000/books/book-456');
    
    // Select rental period
    await page.click('[data-testid="rent-button"]');
    await page.selectOption('[data-testid="rental-period"]', '7');
    await page.click('[data-testid="confirm-rental"]');
    
    // Complete payment
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.click('[data-testid="pay-button"]');
    
    // Verify success
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    
    // Verify rental in library with expiry date
    await expect(page.locator('[data-testid="rental-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="rental-expiry"]')).toContainText('7 days');
  });
});
```

#### 3. Payment Webhook Handling

```typescript
test.describe('Payment Webhook', () => {
  test('should process webhook and grant access', async ({ page }) => {
    // Simulate webhook from Paymob
    const webhookPayload = {
      id: 'webhook-123',
      status: 'success',
      amount: 100,
      currency: 'EGP',
      paymentMethod: 'card',
      orderId: 'order-456',
      signature: 'valid-signature',
    };

    const response = await page.request.post('/api/v1/webhooks/paymob', {
      data: webhookPayload,
    });

    expect(response.ok()).toBe(true);
    
    // Verify database updated
    const payment = await db.query('SELECT * FROM payments WHERE id = $1', ['payment-456']);
    expect(payment.rows[0].status).toBe('completed');
  });
});
```

---

## Testing by Phase

### Phase 1: Foundation (Weeks 1-2)

**Unit Tests:**
- ✅ Auth service (login, register, token generation)
- ✅ Password hashing
- ✅ JWT token creation/validation

**Integration Tests:**
- ✅ POST /auth/register
- ✅ POST /auth/login
- ✅ GET /auth/session
- ✅ POST /auth/refresh

**E2E Tests:**
- ✅ User registration flow
- ✅ User login flow
- ✅ OAuth login flow (Google)

**Coverage Target:** 80%

---

### Phase 2: Core Domain (Weeks 3-5)

**Unit Tests:**
- ✅ Users service (CRUD, verification)
- ✅ Stories service (CRUD, publishing)
- ✅ Story status workflow

**Integration Tests:**
- ✅ GET /users/:id
- ✅ PATCH /users/:id
- ✅ POST /stories
- ✅ PATCH /stories/:id
- ✅ POST /stories/:id/publish
- ✅ GET /stories
- ✅ Search integration

**E2E Tests:**
- ✅ Create and publish story
- ✅ Search stories
- ✅ View story

**Coverage Target:** 80%

---

### Phase 3: Social Features (Weeks 6-7)

**Unit Tests:**
- ✅ Reactions service
- ✅ Comments service
- ✅ Follows service

**Integration Tests:**
- ✅ POST /stories/:id/react
- ✅ POST /stories/:id/comments
- ✅ POST /users/:id/follow
- ✅ GET /notifications

**E2E Tests:**
- ✅ Follow user
- ✅ Like story
- ✅ Comment on story
- ✅ Send message

**Coverage Target:** 80%

---

### Phase 4: Books & Commerce (Weeks 8-10)

**Unit Tests:**
- ✅ Books service (CRUD, purchase, rental)
- ✅ Rental service (extensions, expiry)
- ✅ Payments service (webhook handling, idempotency)

**Integration Tests:**
- ✅ POST /books
- ✅ POST /books/:id/purchase
- ✅ POST /books/:id/rent
- ✅ POST /books/:id/extend
- ✅ GET /library
- ✅ Payment webhook handling

**E2E Tests:**
- ✅ Purchase book (full flow)
- ✅ Rent book (full flow)
- ✅ Extend rental
- ✅ View library
- ✅ **Payment webhook idempotency**

**Coverage Target:** 90% (critical module)

---

### Phase 5: Contests (Weeks 11-12)

**Unit Tests:**
- ✅ Contests service (CRUD, submissions, voting)
- ✅ Winner selection logic

**Integration Tests:**
- ✅ POST /contests
- ✅ POST /contests/:id/submit
- ✅ POST /contests/:id/vote
- ✅ POST /contests/:id/winner

**E2E Tests:**
- ✅ Create contest (publisher)
- ✅ Submit entry
- ✅ Vote for entry
- ✅ Select winner
- ✅ Prize distribution

**Coverage Target:** 85%

---

### Phase 6: Moderation & Polish (Weeks 13-16)

**Unit Tests:**
- ✅ Moderation service (reports, actions)
- ✅ WAF middleware
- ✅ Rate limiting

**Integration Tests:**
- ✅ POST /reports
- ✅ POST /admin/moderation/actions
- ✅ WAF blocking

**E2E Tests:**
- ✅ Report content
- ✅ Moderator takes action
- ✅ User restriction
- ✅ Admin dashboard

**Coverage Target:** 85%

---

## Test Data Management

### Test Factories

```typescript
// backend/src/test/factories/user.factory.ts
export class UserFactory {
  static create(overrides?: Partial<User>): User {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      username: faker.internet.userName(),
      accountType: 'reader',
      ...overrides,
    };
  }
}

// Usage
const user = UserFactory.create({ accountType: 'writer' });
```

### Test Database

```typescript
// Use separate test database
const testDb = 'hakawi_test';

// Clean database before each test
beforeEach(async () => {
  await db.deleteFrom('users').execute();
  await db.deleteFrom('stories').execute();
  // ... clean all tables
});

// Run migrations before all tests
beforeAll(async () => {
  await runMigrations(testDb);
});

// Drop database after all tests
afterAll(async () => {
  await db.disconnect();
});
```

---

## CI/CD Testing

### GitHub Actions Workflow

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:cov
      - run: npm run test:cov:check  # Fail if coverage < 80%

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hakawi_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hakawi_test
      valkey:
        image: valkey/valkey:latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: docker-compose up -d
      - run: npm install
      - run: npm run db:migrate
      - run: npm run test:e2e
```

---

## Testing Checklist

### Before Every PR

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Code coverage ≥ 80%
- [ ] No linting errors
- [ ] Tests added for new features
- [ ] Tests updated for changed features

### Before Every Release

- [ ] All tests pass (unit, integration, E2E)
- [ ] E2E tests pass in staging environment
- [ ] Payment E2E tests pass
- [ ] Performance tests pass
- [ ] Security tests pass
- [ ] Load tests pass (if applicable)

---

## Related Documentation

- ADR-013: Testing Strategy
- Development Setup: `development/setup.md`
- Code Standards: `development/code-standards.md`

---

*This document defines the testing strategy for Hakawi. TDD is mandatory from Week 1. All code must be tested.*

