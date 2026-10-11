import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ContestsService } from '../contests.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type {
  Contest,
  ContestPrize,
  ContestPrizeResponse,
  ContestResponse,
  ContestSubmission,
  ContestSubmissionResponse,
  ContestVote,
  ContestVoteResponse,
  ContestsListResponse,
  CreateContestInput,
  PublisherStatsResponse,
  PublisherSubmissionOverview,
  PublisherVoteOverview,
  UpdateContestInput,
} from '../types.ts';

import { ContestsController } from './contests.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type ContestsFindAllParams = {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: string;
  search?: string;
};

type SubmissionsListResponse = {
  submissions: ContestSubmissionResponse[];
  total: number;
  page: number;
  limit: number;
};

type VotesListResponse = {
  votes: ContestVoteResponse[];
  total: number;
  page: number;
  limit: number;
};

type MockContestsService = {
  findAll: ReturnType<typeof vi.fn<(params: ContestsFindAllParams) => Promise<ContestsListResponse>>>;
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestResponse>>>;
  create: ReturnType<typeof vi.fn<(createdBy: string, input: CreateContestInput) => Promise<Contest>>>;
  update: ReturnType<typeof vi.fn<(id: string, input: UpdateContestInput, userId: string) => Promise<Contest>>>;
  start: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Contest>>>;
  cancel: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Contest>>>;
  complete: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Contest>>>;
  submitStory: ReturnType<
    typeof vi.fn<(contestId: string, authorId: string, storyId: string, userId: string) => Promise<ContestSubmission>>
  >;
  getSubmissions: ReturnType<typeof vi.fn<(contestId: string, page: number, limit: number) => Promise<SubmissionsListResponse>>>;
  castVote: ReturnType<typeof vi.fn<(contestId: string, submissionId: string, userId: string) => Promise<ContestVote>>>;
  getVotes: ReturnType<
    typeof vi.fn<
      (contestId: string, submissionId: string | undefined, page: number, limit: number) => Promise<VotesListResponse>
    >
  >;
  selectWinner: ReturnType<
    typeof vi.fn<(contestId: string, submissionId: string, winnerId: string, userId: string) => Promise<Contest>>
  >;
  approveSubmission: ReturnType<
    typeof vi.fn<(submissionId: string, contestId: string, userId: string) => Promise<ContestSubmission>>
  >;
  rejectSubmission: ReturnType<
    typeof vi.fn<(submissionId: string, contestId: string, userId: string) => Promise<ContestSubmission>>
  >;
  distributePrize: ReturnType<
    typeof vi.fn<
      (
        contestId: string,
        submissionId: string,
        winnerId: string,
        prizeType: string,
        prizeDescription: string | null | undefined,
        userId: string,
        amount?: number | null,
        currency?: string | null,
      ) => Promise<ContestPrize>
    >
  >;
  getPrizes: ReturnType<typeof vi.fn<(contestId: string) => Promise<ContestPrizeResponse[]>>>;
  getPublisherStats: ReturnType<typeof vi.fn<(publisherId: string) => Promise<PublisherStatsResponse>>>;
  getPublisherSubmissionsOverview: ReturnType<
    typeof vi.fn<(contestId: string, publisherId: string) => Promise<PublisherSubmissionOverview[]>>
  >;
  getPublisherVotesOverview: ReturnType<
    typeof vi.fn<(contestId: string, publisherId: string) => Promise<PublisherVoteOverview[]>>
  >;
};

function makeContest(overrides: Partial<Contest> = {}): Contest {
  return {
    id: 'contest-1',
    title: 'Test Contest',
    description: null,
    categoryId: null,
    startDate: new Date(),
    endDate: new Date(),
    submissionDeadline: new Date(),
    status: 'draft',
    createdBy: 'user-1',
    winnerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const PUBLISHER_STATS: PublisherStatsResponse = {
  totalContests: 0,
  activeContests: 0,
  completedContests: 0,
  totalSubmissions: 0,
  pendingSubmissions: 0,
  approvedSubmissions: 0,
  rejectedSubmissions: 0,
  totalVotes: 0,
  totalPrizes: 0,
};

describe('ContestsController', () => {
  let app: INestApplication<Server>;
  let contestsService: MockContestsService;

  beforeAll(async () => {
    contestsService = {
      findAll: vi.fn<(params: ContestsFindAllParams) => Promise<ContestsListResponse>>(),
      findById: vi.fn<(id: string) => Promise<ContestResponse>>(),
      create: vi.fn<(createdBy: string, input: CreateContestInput) => Promise<Contest>>(),
      update: vi.fn<(id: string, input: UpdateContestInput, userId: string) => Promise<Contest>>(),
      start: vi.fn<(id: string, userId: string) => Promise<Contest>>(),
      cancel: vi.fn<(id: string, userId: string) => Promise<Contest>>(),
      complete: vi.fn<(id: string, userId: string) => Promise<Contest>>(),
      submitStory:
        vi.fn<(contestId: string, authorId: string, storyId: string, userId: string) => Promise<ContestSubmission>>(),
      getSubmissions: vi.fn<(contestId: string, page: number, limit: number) => Promise<SubmissionsListResponse>>(),
      castVote: vi.fn<(contestId: string, submissionId: string, userId: string) => Promise<ContestVote>>(),
      getVotes:
        vi.fn<
          (contestId: string, submissionId: string | undefined, page: number, limit: number) => Promise<VotesListResponse>
        >(),
      selectWinner:
        vi.fn<(contestId: string, submissionId: string, winnerId: string, userId: string) => Promise<Contest>>(),
      approveSubmission:
        vi.fn<(submissionId: string, contestId: string, userId: string) => Promise<ContestSubmission>>(),
      rejectSubmission:
        vi.fn<(submissionId: string, contestId: string, userId: string) => Promise<ContestSubmission>>(),
      distributePrize:
        vi.fn<
          (
            contestId: string,
            submissionId: string,
            winnerId: string,
            prizeType: string,
            prizeDescription: string | null | undefined,
            userId: string,
            amount?: number | null,
            currency?: string | null,
          ) => Promise<ContestPrize>
        >(),
      getPrizes: vi.fn<(contestId: string) => Promise<ContestPrizeResponse[]>>(),
      getPublisherStats: vi.fn<(publisherId: string) => Promise<PublisherStatsResponse>>(),
      getPublisherSubmissionsOverview:
        vi.fn<(contestId: string, publisherId: string) => Promise<PublisherSubmissionOverview[]>>(),
      getPublisherVotesOverview: vi.fn<(contestId: string, publisherId: string) => Promise<PublisherVoteOverview[]>>(),
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
        // `@Secured` composes `RestrictionGuard`, which injects `ValkeyService` and the logger.
        // This module is hand-built rather than importing `CommonModule`, so both must be provided
        // here or Nest fails at DI resolution before any assertion runs.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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

      const res = await request(app.getHttpServer()).get('/contests').expect(200);

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

      const res = await request(app.getHttpServer()).get('/contests/contest-1').expect(200);

      expect(res.body).toHaveProperty('id', 'contest-1');
      expect(res.body).toHaveProperty('category', 'Speculative');
      expect(contestsService.findById).toHaveBeenCalledWith('contest-1');
    });
  });

  describe('POST /contests', () => {
    it('should create a contest', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin');

      vi.mocked(contestsService.create).mockResolvedValue(makeContest());

      const res = await request(app.getHttpServer())
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

      vi.mocked(contestsService.update).mockResolvedValue(makeContest({ title: 'Updated Contest' }));

      const res = await request(app.getHttpServer())
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

      vi.mocked(contestsService.start).mockResolvedValue(makeContest({ status: 'active' }));

      const res = await request(app.getHttpServer())
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

      const res = await request(app.getHttpServer())
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
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/contests/contest-1/submissions').expect(200);

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
      vi.mocked(contestsService.getPublisherStats).mockResolvedValue(PUBLISHER_STATS);

      const res = await request(app.getHttpServer())
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

      const res = await request(app.getHttpServer())
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

      await request(app.getHttpServer()).get('/contests/not-a-uuid').expect(404);

      expect(contestsService.findById).toHaveBeenCalledWith('not-a-uuid');
    });
  });
});
