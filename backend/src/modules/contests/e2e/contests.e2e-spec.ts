import { type Server } from 'http';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { EncryptionService } from '../../../common/utils/encryption.util.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';
import { UsersEventHandler } from '../../../modules/users/events/users.event-handler.ts';

interface JsonResponse<TBody> {
  status: number;
  body: TBody;
}

interface RegisterResponseBody {
  id: string;
  email: string;
  name: string;
  username: string;
  accountType: string;
}

interface LoginResponseBody {
  tokens: { accessToken: string };
}

interface ContestResponseBody {
  id: string;
  title: string;
  status: string;
}

interface SubmissionResponseBody {
  id: string;
  contestId: string;
  storyId: string;
}

interface CategoryResponseBody {
  id: string;
  name: string;
  slug: string;
}

// drizzle-ORM db and sql template tags are typed as `any` by the library.
// Supertest request chains propagate `any` from the untyped CommonJS default import.
// These are accepted external-library typing limitations — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */

describe('Contests E2E', () => {
  let app: INestApplication;
  let httpServer: Server;
  let logger: WinstonLoggerService;
  let accessToken: string;
  let categoryId: string;
  let contestId: string;
  let storyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'REFLECTOR',
          useValue: new Reflector(),
        },
        WinstonLoggerService,
        ValkeyService,
        EventEmitter2,
        UsersRepository,
        {
          provide: USERS_REPOSITORY,
          useExisting: UsersRepository,
        },
      ],
    })
      .overrideProvider(UsersEventHandler)
      .useValue({
        handleUserRegistered: () => Promise.resolve(),
        handleUserUpdated: () => Promise.resolve(),
      })
      .overrideProvider(EncryptionService)
      .useValue({
        encrypt: (plaintext: string) => plaintext,
        decrypt: (ciphertext: string) => ciphertext,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
    logger = app.get(WinstonLoggerService);

    const registerPublisher = (await request(httpServer).post('/auth/register').send({
      email: 'e2e-publisher@example.com',
      password: 'SecurePass123!',
      name: 'E2E Publisher',
      username: 'e2epublisher',
      accountType: 'author',
    })) as JsonResponse<RegisterResponseBody>;

    void registerPublisher.body.id;

    const loginPublisher = (await request(httpServer).post('/auth/login').send({
      email: 'e2e-publisher@example.com',
      password: 'SecurePass123!',
    })) as JsonResponse<LoginResponseBody>;

    accessToken = loginPublisher.body.tokens.accessToken;

    const categoryRes = (await request(httpServer)
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'E2E Contest Category', slug: 'e2e-contest-category' })) as JsonResponse<CategoryResponseBody>;

    categoryId = categoryRes.body.id;

    const registerAuthor = (await request(httpServer).post('/auth/register').send({
      email: 'e2e-author@example.com',
      password: 'SecurePass123!',
      name: 'E2E Author',
      username: 'e2eauthor',
      accountType: 'author',
    })) as JsonResponse<RegisterResponseBody>;

    void registerAuthor.body.id;

    const registerVoter = (await request(httpServer).post('/auth/register').send({
      email: 'e2e-voter@example.com',
      password: 'SecurePass123!',
      name: 'E2E Voter',
      username: 'e2evoter',
      accountType: 'reader',
    })) as JsonResponse<RegisterResponseBody>;

    void registerVoter.body.id;

    const storyRes = await request(httpServer)
      .post('/stories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'E2E Test Story',
        slug: `e2e-test-story-${Date.now()}`,
        content: 'This is an E2E test story content.',
        categoryId,
      });

    if (!storyRes.body?.id) {
      throw new Error(`Story creation failed: ${JSON.stringify(storyRes.body)}`);
    }

    storyId = storyRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /contests', () => {
    it('should create a contest', async () => {
      const res = (await request(httpServer)
        .post('/contests')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Test Contest',
          description: 'E2E contest description',
          categoryId,
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          submissionDeadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        })
        .expect(201)) as JsonResponse<ContestResponseBody>;

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('E2E Test Contest');
      expect(res.body.status).toBe('draft');
      contestId = res.body.id;
    });
  });

  describe('POST /contests/:id/start', () => {
    it('should start a draft contest', async () => {
      const res = (await request(httpServer)
        .post(`/contests/${contestId}/start`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)) as JsonResponse<ContestResponseBody>;

      expect(res.body.status).toBe('active');
    });
  });

  describe('POST /contests/:id/submissions', () => {
    it('should submit a story to contest', async () => {
      logger.debug(`storyId: ${storyId} contestId: ${contestId}`, 'ContestsE2E');
      const res = (await request(httpServer)
        .post(`/contests/${contestId}/submissions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId })
        .expect(201)) as JsonResponse<SubmissionResponseBody>;

      expect(res.body).toHaveProperty('id');
      expect(res.body.contestId).toBe(contestId);
      expect(res.body.storyId).toBe(storyId);
    });
  });

  describe('POST /contests/:id/submissions/:submissionId/approve', () => {
    it('should approve a submission', async () => {
      const submissionsRes = (await request(httpServer)
        .get(`/contests/${contestId}/submissions`)
        .expect(200)) as JsonResponse<{ submissions: SubmissionResponseBody[]; total: number }>;

      const submissionId: string = submissionsRes.body.submissions[0].id;

      const res = (await request(httpServer)
        .post(`/contests/${contestId}/submissions/${submissionId}/approve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)) as JsonResponse<{ status: string }>;

      expect(res.body.status).toBe('approved');
    });
  });

  describe('POST /contests/:id/cancel', () => {
    it('should cancel an active contest', async () => {
      const res = (await request(httpServer)
        .post(`/contests/${contestId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)) as JsonResponse<ContestResponseBody>;

      expect(res.body.status).toBe('cancelled');
    });
  });

  describe('Full Contest Flow', () => {
    let activeContestId: string;
    let approvedSubmissionId: string;

    beforeAll(async () => {
      const res = (await request(httpServer)
        .post('/contests')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Active Contest',
          description: 'E2E active contest description',
          categoryId,
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          submissionDeadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        })) as JsonResponse<ContestResponseBody>;

      activeContestId = res.body.id;

      await request(httpServer)
        .post(`/contests/${activeContestId}/start`)
        .set('Authorization', `Bearer ${accessToken}`);

      const submissionRes = (await request(httpServer)
        .post(`/contests/${activeContestId}/submissions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId })) as JsonResponse<SubmissionResponseBody>;

      approvedSubmissionId = submissionRes.body.id;

      await request(httpServer)
        .post(`/contests/${activeContestId}/submissions/${approvedSubmissionId}/approve`)
        .set('Authorization', `Bearer ${accessToken}`);
    });

    it('should move contest to voting and allow voting', async () => {
      await request(httpServer)
        .post(`/contests/${activeContestId}/complete`)
        .set('Authorization', `Bearer ${accessToken}`);

      const contest = (await request(httpServer)
        .get(`/contests/${activeContestId}`)
        .expect(200)) as JsonResponse<ContestResponseBody>;

      expect(contest.body.status).toBe('completed');
    });
  });

  describe('Publisher Dashboard', () => {
    it('should return publisher stats', async () => {
      const res = (await request(httpServer)
        .get('/contests/publisher/stats')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)) as JsonResponse<Record<string, unknown>>;

      expect(res.body).toHaveProperty('totalContests');
      expect(res.body).toHaveProperty('activeContests');
      expect(res.body).toHaveProperty('totalSubmissions');
    });
  });
});
