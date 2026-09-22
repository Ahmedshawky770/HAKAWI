import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { JwtHelper } from '../common/utils/jwt.util.js';

describe('Auth E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass123!',
          name: 'E2E Test User',
          username: 'e2etestuser',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body).toHaveProperty('tokens');
          expect(res.body.tokens).toHaveProperty('accessToken');
          expect(res.body.tokens).toHaveProperty('refreshToken');
        });
    });

    it('should return 409 for duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass123!',
          name: 'E2E Test User',
          username: 'e2etestuser2',
        })
        .expect(409);
    });
  });

  describe('/auth/login (POST)', () => {
    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass123!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('tokens');
          expect(res.body.tokens).toHaveProperty('accessToken');
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('/auth/session (GET)', () => {
    it('should return session with valid token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass123!',
        });

      const accessToken = loginRes.body.tokens.accessToken;

      return request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body.user.email).toBe('e2e-test@example.com');
        });
    });
  });
});

describe('Users E2E', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'e2e-test@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/users/:id (GET)', () => {
    it('should return user profile', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass123!',
        });

      const userId = loginRes.body.user.id;

      return request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('email');
          expect(res.body).not.toHaveProperty('passwordHash');
        });
    });
  });

  describe('/users/:id (PATCH)', () => {
    it('should update user profile', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass123!',
        });

      const userId = loginRes.body.user.id;

      return request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Name');
        });
    });
  });
});

describe('Stories E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let authorId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'author-e2e@example.com',
        password: 'SecurePass123!',
        name: 'Author User',
        username: 'authore2e',
      });

    authorId = registerRes.body.user.id;
    accessToken = registerRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/stories (POST)', () => {
    it('should create a story', () => {
      return request(app.getHttpServer())
        .post('/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Test Story',
          content: 'This is a test story content with enough words to be valid.',
          category: 'fiction',
          tags: ['test'],
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.title).toBe('E2E Test Story');
        });
    });
  });

  describe('/stories/published (GET)', () => {
    it('should return published stories', () => {
      return request(app.getHttpServer())
        .get('/stories/published')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
