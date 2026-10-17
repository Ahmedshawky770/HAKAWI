import type { Server } from 'node:http';

import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';

import { CommentsController } from '../../modules/comments/controllers/comments.controller.ts';
import { CommentsService } from '../../modules/comments/comments.service.ts';
import { FollowsController } from '../../modules/follows/controllers/follows.controller.ts';
import { FollowsService } from '../../modules/follows/follows.service.ts';
import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { AccountRestrictionService } from '../services/account-restriction.service.ts';

import { JwtAuthGuard } from './jwt-auth.guard.ts';
import { OwnershipGuard } from './ownership.guard.ts';
import { RestrictionGuard } from './restriction.guard.ts';

/**
 * PROVES THE ROUTE COVERAGE, which the `@Secured` wiring spec cannot.
 *
 * `restriction-guard.wiring.spec.ts` proves the guard runs when a route composes it through
 * `@Secured`. The defect this suite closes was one layer out: every regular-user write route —
 * `POST /comments`, `POST /follows`, `POST /stories`, the message senders, the upload confirmations —
 * carried raw `@UseGuards(JwtAuthGuard)` instead, so `RestrictionGuard` was reachable on the admin
 * routes and absent from exactly the routes a muted or banned account uses. A banned user kept
 * posting, commenting and messaging for the whole ban, because no guard on those routes ever asked.
 *
 * A unit test of `RestrictionGuard` cannot see that, and the controller unit specs cannot either:
 * they construct the controller directly and guards never execute. What catches it is real HTTP
 * through the REAL controllers — which is why this suite imports `CommentsController` and
 * `FollowsController` themselves rather than a probe: a future edit that drops `RestrictionGuard`
 * from one of those guard chains fails here, at the route the owner actually serves.
 *
 * WHY TWO CONTROLLERS. One proves the plain chain (`JwtAuthGuard, RestrictionGuard`) and one proves
 * the three-guard chain that also carries `OwnershipGuard`, whose position after `JwtAuthGuard` and
 * before the handler is load-bearing for both.
 */
const JWT_SECRET = 'restriction-route-coverage-spec-secret-32-chars-minimum';
const STORY_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('User-facing write routes enforce the account restriction', () => {
  let app: INestApplication<Server>;
  let valkey: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  const tokenFor = (sub: string): Promise<string> =>
    new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email: `${sub}@test.com`, accountType: 'reader' });

  /** A route the muted account must still be able to reach, so "mute means read" is exercised too. */
  @Controller('reads')
  class PublicReadProbeController {
    @Get('open')
    find(): { ok: true } {
      return { ok: true };
    }
  }

  beforeEach(async () => {
    valkey = { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() };
    const winstonLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
    } as unknown as WinstonLoggerService;

    const commentsService = {
      create: vi.fn().mockResolvedValue({ id: 'comment-1', storyId: STORY_ID, authorId: USER_ID, content: 'hi' }),
      findByStory: vi.fn().mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20 }),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const followsService = {
      follow: vi.fn().mockResolvedValue({ id: 'follow-1', followerId: USER_ID, followingId: USER_ID }),
      unfollow: vi.fn(),
      getStats: vi.fn().mockResolvedValue({ followers: 0, following: 0 }),
      isFollowing: vi.fn().mockResolvedValue(false),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [CommentsController, FollowsController, PublicReadProbeController],
      providers: [
        JwtAuthGuard,
        RestrictionGuard,
        OwnershipGuard,
        { provide: CommentsService, useValue: commentsService },
        { provide: FollowsService, useValue: followsService },
        { provide: ValkeyService, useValue: valkey },
        {
          provide: AccountRestrictionService,
          useValue: new AccountRestrictionService(valkey as unknown as ValkeyService, winstonLogger),
        },
        { provide: WinstonLoggerService, useValue: winstonLogger },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
        // Registered the way `main.ts` registers it, so the order this test proves is the order that
        // runs in production: JwtAuthGuard populates `request.user`, then RestrictionGuard reads it.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const asBanned = (): void => {
    valkey.exists.mockResolvedValue(true);
    valkey.get.mockResolvedValue('ban');
  };

  const asMuted = (): void => {
    valkey.exists.mockResolvedValue(true);
    valkey.get.mockResolvedValue('mute');
  };

  it('refuses a BANNED account on POST /comments', async () => {
    asBanned();

    await request(app.getHttpServer())
      .post('/comments')
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .send({ storyId: STORY_ID, content: 'still posting while banned' })
      .expect(HttpStatus.FORBIDDEN);
  });

  it('refuses a BANNED account on POST /follows', async () => {
    asBanned();

    await request(app.getHttpServer())
      .post('/follows')
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .send({ followingId: USER_ID })
      .expect(HttpStatus.FORBIDDEN);
  });

  it('lets a MUTED account read but answers 423 when it writes', async () => {
    asMuted();

    // The reads: a mute takes publication away, not reading. The first is a public route, so it
    // also covers the muted account's access to the content the write would have added to; the
    // second is an authenticated read, which is the shape `GET /library`, `GET /notifications`
    // and the profile routes take for the same account.
    await request(app.getHttpServer())
      .get(`/comments/story/${STORY_ID}`)
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .expect(HttpStatus.OK);

    await request(app.getHttpServer())
      .get('/reads/open')
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .expect(HttpStatus.OK);

    // The write.
    await request(app.getHttpServer())
      .post('/comments')
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .send({ storyId: STORY_ID, content: 'muted, so not posting' })
      .expect(HttpStatus.LOCKED);
  });

  it('answers 423 on PATCH /comments/:id before OwnershipGuard runs, because RestrictionGuard is first', async () => {
    asMuted();

    // The order matters twice over: RestrictionGuard before OwnershipGuard means a muted account is
    // told about the mute rather than about ownership, and the ownership resolver below is never
    // consulted at all — which is what keeps the mute answer from depending on whose comment it is.
    await request(app.getHttpServer())
      .patch(`/comments/${STORY_ID}`)
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .send({ content: 'edited while muted' })
      .expect(HttpStatus.LOCKED);
  });

  it('lets an unrestricted account write', async () => {
    await request(app.getHttpServer())
      .post('/comments')
      .set('Authorization', `Bearer ${await tokenFor(USER_ID)}`)
      .send({ storyId: STORY_ID, content: 'hello' })
      .expect(HttpStatus.CREATED);
  });
});
