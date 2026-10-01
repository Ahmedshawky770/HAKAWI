import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ContestsService } from '../contests.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { Contest } from '../types.ts';

import { ContestsController } from './contests.controller.ts';

type MockContestsService = {
  findAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  submitStory: ReturnType<typeof vi.fn>;
  getSubmissions: ReturnType<typeof vi.fn>;
  castVote: ReturnType<typeof vi.fn>;
  getVotes: ReturnType<typeof vi.fn>;
  selectWinner: ReturnType<typeof vi.fn>;
  approveSubmission: ReturnType<typeof vi.fn>;
  rejectSubmission: ReturnType<typeof vi.fn>;
  distributePrize: ReturnType<typeof vi.fn>;
  getPrizes: ReturnType<typeof vi.fn>;
  getPublisherStats: ReturnType<typeof vi.fn>;
  getPublisherSubmissionsOverview: ReturnType<typeof vi.fn>;
  getPublisherVotesOverview: ReturnType<typeof vi.fn>;
};

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

describe('ContestsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let contestsService: MockContestsService;

  beforeAll(async () => {
    contestsService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      start: vi.fn(),
      cancel: vi.fn(),
      complete: vi.fn(),
      submitStory: vi.fn(),
      getSubmissions: vi.fn(),
      castVote: vi.fn(),
      getVotes: vi.fn(),
      selectWinner: vi.fn(),
      approveSubmission: vi.fn(),
      rejectSubmission: vi.fn(),
      distributePrize: vi.fn(),
      getPrizes: vi.fn(),
      getPublisherStats: vi.fn(),
      getPublisherSubmissionsOverview: vi.fn(),
      getPublisherVotesOverview: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [ContestsController],
      providers: [
        {
          provide: ContestsService,
          useValue: contestsService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /contests', () => {
    it('should return all contests', async () => {
      vi.mocked(contestsService.findAll).mockResolvedValue({
        contests: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(httpServer).get('/contests').expect(200);

      expect(res.body).toHaveProperty('contests');
      expect(res.body).toHaveProperty('total', 0);
      expect(contestsService.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /contests/:id', () => {
    it('should return a contest by id', async () => {
      // `findById` returns the response shape, not the row: dates are already ISO strings and the
      // category is resolved, so the detail page no longer has to render a raw categoryId UUID.
      vi.mocked(contestsService.findById).mockResolvedValue({
        id: 'contest-1',
        title: 'Test Contest',
        description: null,
        categoryId: 'cat-1',
        category: 'Speculative',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-12-31T00:00:00.000Z',
        submissionDeadline: '2024-06-30T00:00:00.000Z',
        status: 'draft',
        createdBy: 'user-1',
        winnerId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const res = await request(httpServer).get('/contests/contest-1').expect(200);

      expect(res.body).toHaveProperty('id', 'contest-1');
      expect(res.body).toHaveProperty('category', 'Speculative');
      expect(contestsService.findById).toHaveBeenCalledWith('contest-1');
    });
  });

  describe('POST /contests', () => {
    it('should create a contest', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(contestsService.create).mockResolvedValue({
        id: 'contest-1',
        title: 'Test Contest',
        status: 'draft',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Contest);

      const res = await request(httpServer)
        .post('/contests')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Contest' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'contest-1');
      expect(contestsService.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /contests/:id', () => {
    it('should update a contest', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(contestsService.update).mockResolvedValue({
        id: 'contest-1',
        title: 'Updated Contest',
        status: 'draft',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Contest);

      const res = await request(httpServer)
        .patch('/contests/contest-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Contest' })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Contest');
      expect(contestsService.update).toHaveBeenCalled();
    });
  });

  describe('POST /contests/:id/start', () => {
    it('should start a contest', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(contestsService.start).mockResolvedValue({
        id: 'contest-1',
        title: 'Test Contest',
        status: 'active',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Contest);

      const res = await request(httpServer)
        .post('/contests/contest-1/start')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'active');
      expect(contestsService.start).toHaveBeenCalledWith('contest-1', 'user-1');
    });
  });

  describe('POST /contests/:id/submissions', () => {
    it('should submit a story to contest', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(contestsService.submitStory).mockResolvedValue({
        id: 'submission-1',
        contestId: 'contest-1',
        storyId: 'story-1',
        authorId: 'user-1',
        status: 'pending',
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
      });

      const res = await request(httpServer)
        .post('/contests/contest-1/submissions')
        .set('Authorization', `Bearer ${token}`)
        .send({ storyId: 'story-1' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'submission-1');
      expect(contestsService.submitStory).toHaveBeenCalled();
    });
  });

  describe('GET /contests/:id/submissions', () => {
    it('should return contest submissions', async () => {
      vi.mocked(contestsService.getSubmissions).mockResolvedValue({
        submissions: [],
        total: 0,
      });

      const res = await request(httpServer).get('/contests/contest-1/submissions').expect(200);

      expect(res.body).toHaveProperty('submissions');
      expect(contestsService.getSubmissions).toHaveBeenCalled();
    });
  });

  /**
   * Express matches in declaration order, so a literal segment declared after `@Get(':id')` is one
   * edit away from being swallowed by it. `publisher/stats` only survives today because it has a
   * different number of segments than `:id` — an accident of arity, not a guarantee, and invisible
   * to anyone reading the file top to bottom. These two cases pin the real routing: the static
   * route must be the one that answers, and a non-UUID `:id` must be a 404 rather than a 500 from
   * PostgreSQL.
   */
  describe('route ordering between static segments and :id', () => {
    it('routes GET /contests/publisher/stats to the publisher handler, not to findById', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');
      vi.mocked(contestsService.getPublisherStats).mockResolvedValue({
        totalContests: 0,
        activeContests: 0,
        completedContests: 0,
        totalSubmissions: 0,
        pendingSubmissions: 0,
        approvedSubmissions: 0,
        rejectedSubmissions: 0,
        totalVotes: 0,
        totalPrizes: 0,
      });

      const res = await request(httpServer)
        .get('/contests/publisher/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalContests', 0);
      expect(contestsService.getPublisherStats).toHaveBeenCalledWith('user-1');
      expect(contestsService.findById).not.toHaveBeenCalled();
    });

    it('routes GET /contests/publisher/:id/votes to the publisher handler', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');
      vi.mocked(contestsService.getPublisherVotesOverview).mockResolvedValue([]);

      const res = await request(httpServer)
        .get('/contests/publisher/contest-1/votes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
      expect(contestsService.getPublisherVotesOverview).toHaveBeenCalledWith('contest-1', 'user-1');
      expect(contestsService.getVotes).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID :id as 404 instead of letting it reach the database', async () => {
      // `ContestsRepository.findContestById` translates PostgreSQL error 22P02 into "no such
      // contest", which is what keeps `/contests/publisher` (a plausible static path) a 404 rather
      // than a 500. The routing spec above is the real guard; this one pins the failure mode.
      vi.mocked(contestsService.findById).mockRejectedValue(new NotFoundException('Contest not found'));

      await request(httpServer).get('/contests/not-a-uuid').expect(404);

      expect(contestsService.findById).toHaveBeenCalledWith('not-a-uuid');
    });
  });
});
