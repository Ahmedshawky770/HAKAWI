# Integration Tests
## Hakawi Testing Guide

This document provides comprehensive integration test examples for the Hakawi platform.

---

## Integration Test Strategy

### Scope
- Module integration tests
- API endpoint tests
- Database integration tests
- Third-party service integration tests
- Event-driven integration tests

### Tools
- Jest (test runner)
- Supertest (HTTP assertions)
- Testcontainers (database)
- @nestjs/testing (NestJS testing utilities)

---

## Test Structure

```
tests/
├── integration/
│   ├── auth/
│   │   ├── auth.service.spec.ts
│   │   └── auth.controller.spec.ts
│   ├── users/
│   │   ├── users.service.spec.ts
│   │   └── users.controller.spec.ts
│   ├── stories/
│   │   ├── stories.service.spec.ts
│   │   └── stories.controller.spec.ts
│   ├── interactions/
│   │   ├── follows.service.spec.ts
│   │   ├── reactions.service.spec.ts
│   │   └── comments.service.spec.ts
│   ├── notifications/
│   │   └── notifications.service.spec.ts
│   ├── books/
│   │   ├── books.service.spec.ts
│   │   └── purchases.service.spec.ts
│   └── e2e/
│       └── app.e2e-spec.ts
├── fixtures/
│   ├── users.ts
│   ├── stories.ts
│   └── books.ts
└── helpers/
    ├── database.ts
    ├── auth.ts
    └── assertions.ts
```

---

## Setup

### Test Database

```typescript
// tests/helpers/database.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

export async function setupTestDatabase() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'test',
        password: 'test',
        database: 'hakawi_test',
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: true,
        dropSchema: true
      })
    ]
  }).compile();

  return moduleFixture;
}
```

### Test Helpers

```typescript
// tests/helpers/auth.ts
export async function registerAndLogin(app: INestApplication, userData: any) {
  // Register
  await request(app.getHttpServer())
    .post('/auth/register')
    .send(userData);

  // Login
  const loginResponse = await request(app.getHttpServer())
    .post('/auth/login')
    .send({
      email: userData.email,
      password: userData.password
    });

  return loginResponse.body.token;
}

export function createAuthHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
```

---

## Auth Integration Tests

### Auth Service

```typescript
// tests/integration/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../../src/users/users.service';
import { AuthService } from '../../../src/auth/auth.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            findOne: jest.fn()
          }
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(() => 'token'),
            verify: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser'
      };

      const mockUser = {
        id: 'uuid',
        email: userData.email,
        name: userData.name,
        username: userData.username,
        password: await bcrypt.hash(userData.password, 12)
      };

      jest.spyOn(usersService, 'create').mockResolvedValue(mockUser);

      const result = await service.register(userData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(userData.email);
    });

    it('should throw if email already exists', async () => {
      jest.spyOn(usersService, 'create').mockRejectedValue(
        new Error('Email already exists')
      );

      await expect(
        service.register({
          email: 'existing@example.com',
          password: 'SecurePass123!',
          name: 'Test',
          username: 'test'
        })
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('login', () => {
    it('should return user and tokens for valid credentials', async () => {
      const user = {
        id: 'uuid',
        email: 'test@example.com',
        password: await bcrypt.hash('password', 12),
        verified: true
      };

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(user);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password'
      });

      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw for invalid credentials', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);

      await expect(
        service.login({
          email: 'wrong@example.com',
          password: 'wrongpassword'
        })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('validateUser', () => {
    it('should return user for valid token', async () => {
      const user = { id: 'uuid', email: 'test@example.com' };
      
      jest.spyOn(jwtService, 'verify').mockReturnValue({ sub: user.id });
      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);

      const result = await service.validateUser('valid-token');

      expect(result).toEqual(user);
    });
  });
});
```

### Auth Controller

```typescript
// tests/integration/auth/auth.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersModule } from '../../../src/users/users.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, UsersModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
          username: 'testuser'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.user).toBeDefined();
          expect(res.body.token).toBeDefined();
          expect(res.body.refreshToken).toBeDefined();
        });
    });

    it('should return 400 for invalid email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'SecurePass123!',
          name: 'Test User',
          username: 'testuser'
        })
        .expect(400);
    });

    it('should return 400 for weak password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          name: 'Test User',
          username: 'testuser'
        })
        .expect(400);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: 'Test User',
          username: 'testuser'
        });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!'
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.user).toBeDefined();
          expect(res.body.token).toBeDefined();
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);
    });
  });
});
```

---

## Users Integration Tests

```typescript
// tests/integration/users/users.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { UsersModule } from '../../../src/users/users.module';
import { AuthModule } from '../../../src/auth/auth.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, UsersModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser'
      });

    authToken = response.body.token;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/users/:id (GET)', () => {
    it('should return user profile', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      
      return request(app.getHttpServer())
        .get(`/users/${userId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.user).toBeDefined();
          expect(res.body.user.id).toBe(userId);
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/users/non-existent-id')
        .expect(404);
    });
  });

  describe('/users/:id (PUT)', () => {
    it('should update user profile', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      
      return request(app.getHttpServer())
        .put(`/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
          bio: 'Updated bio'
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.user.name).toBe('Updated Name');
          expect(res.body.user.bio).toBe('Updated bio');
        });
    });

    it('should return 401 without auth', () => {
      return request(app.getHttpServer())
        .put('/users/123e4567-e89b-12d3-a456-426614174000')
        .send({ name: 'Updated' })
        .expect(401);
    });
  });

  describe('/users/:id/follow (POST)', () => {
    it('should follow a user', () => {
      const userId = 'target-user-id';
      
      return request(app.getHttpServer())
        .post(`/users/${userId}/follow`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.follow).toBeDefined();
        });
    });
  });
});
```

---

## Stories Integration Tests

```typescript
// tests/integration/stories/stories.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { StoriesModule } from '../../../src/stories/stories.module';
import { AuthModule } from '../../../src/auth/auth.module';

describe('StoriesController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, StoriesModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'writer@example.com',
        password: 'SecurePass123!',
        name: 'Writer',
        username: 'writer'
      });

    authToken = response.body.token;
    userId = response.body.user.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/stories (POST)', () => {
    it('should create a new story', () => {
      return request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'My Story',
          content: '<p>Content</p>',
          category: 'fiction',
          tags: ['tag1']
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.story).toBeDefined();
          expect(res.body.story.title).toBe('My Story');
          expect(res.body.story.authorId).toBe(userId);
        });
    });
  });

  describe('/stories (GET)', () => {
    beforeEach(async () => {
      // Create a story
      await request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Story',
          content: '<p>Content</p>',
          category: 'fiction'
        });
    });

    it('should return list of stories', () => {
      return request(app.getHttpServer())
        .get('/stories')
        .expect(200)
        .expect((res) => {
          expect(res.body.stories).toBeDefined();
          expect(Array.isArray(res.body.stories)).toBe(true);
        });
    });

    it('should filter by category', () => {
      return request(app.getHttpServer())
        .get('/stories?category=fiction')
        .expect(200)
        .expect((res) => {
          expect(res.body.stories.every(s => s.category === 'fiction')).toBe(true);
        });
    });
  });
});
```

---

## Comments Integration Tests

```typescript
// tests/integration/comments/comments.controller.spec.ts
describe('CommentsController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let storyId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, StoriesModule, CommentsModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and create story
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: 'User',
        username: 'user'
      });

    authToken = response.body.token;

    const story = await request(app.getHttpServer())
      .post('/stories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Story',
        content: '<p>Content</p>',
        category: 'fiction'
      });

    storyId = story.body.story.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/stories/:id/comments (POST)', () => {
    it('should create a comment', () => {
      return request(app.getHttpServer())
        .post(`/stories/${storyId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Great story!'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.comment).toBeDefined();
          expect(res.body.comment.content).toBe('Great story!');
        });
    });
  });

  describe('/stories/:id/comments (GET)', () => {
    beforeEach(async () => {
      // Create a comment
      await request(app.getHttpServer())
        .post(`/stories/${storyId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Great story!' });
    });

    it('should return comments for story', () => {
      return request(app.getHttpServer())
        .get(`/stories/${storyId}/comments`)
        .expect(200)
        .expect((res) => {
          expect(res.body.comments).toBeDefined();
          expect(res.body.comments.length).toBeGreaterThan(0);
        });
    });
  });
});
```

---

## Books Integration Tests

```typescript
// tests/integration/books/books.controller.spec.ts
describe('BooksController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, BooksModule, PaymentsModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register as author
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'author@example.com',
        password: 'SecurePass123!',
        name: 'Author',
        username: 'author'
      });

    authToken = response.body.token;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/books (POST)', () => {
    it('should create a new book', () => {
      return request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .field('title', 'My Book')
        .field('description', 'Book description')
        .field('price', '9.99')
        .field('category', 'fiction')
        .attach('pdf', Buffer.from('PDF content'), 'book.pdf')
        .attach('cover', Buffer.from('image content'), 'cover.jpg')
        .expect(201)
        .expect((res) => {
          expect(res.body.book).toBeDefined();
          expect(res.body.book.title).toBe('My Book');
        });
    });
  });

  describe('/books/:id/purchase (POST)', () => {
    let bookId: string;

    beforeEach(async () => {
      // Create a book
      const book = await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'My Book',
          description: 'Description',
          price: 9.99,
          category: 'fiction'
        });

      bookId = book.body.book.id;
    });

    it('should purchase a book', () => {
      return request(app.getHttpServer())
        .post(`/books/${bookId}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethodId: 'pm_123'
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.purchase).toBeDefined();
        });
    });
  });
});
```

---

## Event-Driven Integration Tests

```typescript
// tests/integration/events/events.spec.ts
import { EventBus } from '../../../src/events/event-bus';
import { Event } from '../../../src/events/event';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventBus]
    }).compile();

    eventBus = module.get<EventBus>(EventBus);
  });

  describe('emit and on', () => {
    it('should emit and receive events', async () => {
      const handler = jest.fn();
      
      eventBus.on('user.created', handler);
      
      const event: Event = {
        id: 'event-id',
        type: 'user.created',
        payload: { userId: 'user-id' },
        timestamp: new Date()
      };

      await eventBus.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  describe('multiple handlers', () => {
    it('should call all handlers for same event', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('user.created', handler1);
      eventBus.on('user.created', handler2);

      const event: Event = {
        id: 'event-id',
        type: 'user.created',
        payload: {},
        timestamp: new Date()
      };

      await eventBus.emit(event);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});
```

---

## Performance Integration Tests

```typescript
// tests/integration/performance/performance.spec.ts
describe('API Performance', () => {
  let app: INestApplication;
  let authToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, StoriesModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: 'User',
        username: 'user'
      });

    authToken = response.body.token;
  });

  it('GET /stories should respond in < 200ms', async () => {
    const start = Date.now();
    
    await request(app.getHttpServer())
      .get('/stories')
      .expect(200);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200);
  });

  it('POST /stories should respond in < 500ms', async () => {
    const start = Date.now();
    
    await request(app.getHttpServer())
      .post('/stories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Performance Test Story',
        content: '<p>Content</p>',
        category: 'fiction'
      })
      .expect(201);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

---

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific module tests
npm run test:integration -- stories

# Run with coverage
npm run test:integration -- --coverage

# Run in watch mode
npm run test:integration -- --watch
```

---

*This document provides integration test examples for the Hakawi platform.*
