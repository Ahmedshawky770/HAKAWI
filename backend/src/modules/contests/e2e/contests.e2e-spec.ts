import type { Server } from 'node:http';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../../app.module.ts';
import { AdminRole, AccountType } from '../../../common/constants/roles.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { EncryptionService } from '../../../common/utils/encryption.util.ts';
import { UsersRepository } from '../../../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../../../modules/users/interfaces/users-repository.interface.ts';
import { UsersEventHandler } from '../../../modules/users/events/users.event-handler.ts';
import { db } from '../../../db/index.ts';
import type { StoryResponseBody } from '../../../test/helpers/test-context.ts';
import type { JsonResponse, LoginResponseBody } from '../../../test/helpers/test-response-types.ts';

// `POST /auth/register` returns `{ user, tokens }`. This interface used to model the payload FLAT
// (`{ id, email, ... }`), so every `register.body.id` in this file was `undefined` — which is why
// `void registerPublisher.body.id` compiled, and why the category request below silently 403'd.
interface RegisterResponseBody {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    accountType: string;
  };
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

interface PublisherStatsResponseBody {
  totalContests: number;
  activeContests: number;
  totalSubmissions: number;
}

describe('Contests E2E', () => {
  let app: INestApplication<Server>;
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
    httpServer = app.getHttpServer();
    logger = app.get(WinstonLoggerService);

    const registerPublisher = (await request(httpServer).post('/auth/register').send({
      email: 'e2e-publisher@example.com',
      password: 'SecurePass123!',
      name: 'E2E Publisher',
      username: 'e2epublisher',
      accountType: 'author',
    })) as JsonResponse<RegisterResponseBody>;

    await request(httpServer).post('/auth/login').send({
      email: 'e2e-publisher@example.com',
      password: 'SecurePass123!',
    });

    // `POST /categories` is `@Secured(ADMIN)` + `@RequireAdminRole(CONTENT_MODERATOR)` +
    // `@RequirePermissions(CONTENT_EDIT_ALL)`. This request used to be issued with the publisher's
    // plain-author token and its status was NEVER asserted, so the 403 was swallowed, `categoryId`
    // stayed `undefined`, and `CreateContestDto.categoryId` is `@IsOptional()` — meaning every
    // contest created in this file silently had no category. A test that cannot fail is not a test.
    //
    // WHY DIRECT SQL AND NOT `usersRepository.update(...)`: `UpdateUserInput` deliberately omits
    // `accountType` and `adminRole`, so a caller cannot promote itself through the repository. That
    // guard is correct and is not widened here for a test. This is the same escape hatch
    // `test-context.ts#promoteToAdmin` uses.
    //
    // WHY A SECOND LOGIN: the access token carries `account_type` / `admin_role` as they stood when
    // it was minted, so the pre-promotion token is refused by `RolesGuard` even though the row is
    // already an admin's.
    await db.execute(sql`
      UPDATE users
      SET account_type = ${AccountType.ADMIN}, admin_role = ${AdminRole.CONTENT_MODERATOR}
      WHERE id = ${registerPublisher.body.user.id}
    `);

    const reloginPublisher = (await request(httpServer).post('/auth/login').send({
      email: 'e2e-publisher@example.com',
      password: 'SecurePass123!',
    })) as JsonResponse<LoginResponseBody>;

    accessToken = reloginPublisher.body.tokens.accessToken;

    const categoryRes = await request(httpServer)
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'E2E Contest Category', slug: 'e2e-contest-category' })
      .expect(201);

    categoryId = (categoryRes.body as CategoryResponseBody).id;

    // Both fixtures are registered and never logged in: the author and the voter are separate
    // accounts in the same database, and the requests below run as the moderator.
    await request(httpServer).post('/auth/register').send({
      email: 'e2e-author@example.com',
      password: 'SecurePass123!',
      name: 'E2E Author',
      username: 'e2eauthor',
      accountType: 'author',
    });

    await request(httpServer).post('/auth/register').send({
      email: 'e2e-voter@example.com',
      password: 'SecurePass123!',
      name: 'E2E Voter',
      username: 'e2evoter',
      accountType: 'reader',
    });

    const storyRes = (await request(httpServer)
      .post('/stories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'E2E Test Story',
        slug: `e2e-test-story-${Date.now()}`,
        content: 'This is an E2E test story content.',
        categoryId,
      })) as JsonResponse<StoryResponseBody>;

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
        .expect(200)) as JsonResponse<PublisherStatsResponseBody>;

      expect(res.body).toHaveProperty('totalContests');
      expect(res.body).toHaveProperty('activeContests');
      expect(res.body).toHaveProperty('totalSubmissions');
    });
  });
});
