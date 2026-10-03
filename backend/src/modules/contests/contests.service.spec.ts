import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { CONTEST_CACHE_NAMESPACE, ContestsService } from './contests.service.ts';
import type {
  Contest,
  ContestCategorySummary,
  ContestSubmission,
  ContestVote,
  ContestPrize,
  CreateContestInput,
  UpdateContestInput,
  CreateSubmissionInput,
  CastVoteInput,
  DistributePrizeInput,
} from './types.ts';

/**
 * An in-memory stand-in for `TaggedCacheService` that reproduces the behaviour these tests exist
 * to pin down: it stores with `JSON.stringify` and reads back with `JSON.parse`, exactly like
 * Valkey. A mock returning the very object it was handed would keep passing after the bug
 * returned, because that object still holds real `Date`s. An entry whose revival throws is dropped
 * and reported as a miss, the way the real service heals a corrupt payload.
 */
class FakeTaggedCache {
  private readonly store = new Map<string, string>();
  readonly invalidations: { namespace: string; key: string; tags: readonly string[] }[] = [];
  loadCount = 0;

  buildKey(namespace: string, key: string): string {
    return `cache:${namespace}:${key}`;
  }

  seedRaw(namespace: string, key: string, raw: string): void {
    this.store.set(this.buildKey(namespace, key), raw);
  }

  async get<T>(namespace: string, key: string, revive?: (value: T) => T): Promise<T | null> {
    const cacheKey = this.buildKey(namespace, key);
    const raw = this.store.get(cacheKey);
    if (raw === undefined) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as T;
      return revive === undefined ? parsed : revive(parsed);
    } catch {
      this.store.delete(cacheKey);
      return null;
    }
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    this.store.set(this.buildKey(namespace, key), JSON.stringify(value));
  }

  async getOrSet<T>(options: {
    namespace: string;
    key: string;
    load: () => Promise<T>;
    revive?: (value: T) => T;
  }): Promise<{ value: T; hit: boolean }> {
    const cached = await this.get<T>(options.namespace, options.key, options.revive);
    if (cached !== null) {
      return { value: cached, hit: true };
    }
    this.loadCount += 1;
    const loaded = await options.load();
    await this.set(options.namespace, options.key, loaded);
    return { value: loaded, hit: false };
  }

  async invalidateKey(namespace: string, key: string, tags: readonly string[] = []): Promise<void> {
    this.store.delete(this.buildKey(namespace, key));
    this.invalidations.push({ namespace, key, tags });
  }
}

type MockContestsRepository = {
  findContestById: ReturnType<typeof vi.fn<(id: string) => Promise<Contest | null>>>;
  findAllContests: ReturnType<
    typeof vi.fn<
      (params: {
        page?: number;
        limit?: number;
        categoryId?: string;
        status?: string;
        search?: string;
      }) => Promise<{ contests: Contest[]; total: number }>
    >
  >;
  createContest: ReturnType<
    typeof vi.fn<(data: CreateContestInput & { createdBy: string; status: string }) => Promise<Contest>>
  >;
  updateContest: ReturnType<typeof vi.fn<(id: string, data: UpdateContestInput) => Promise<Contest>>>;
  findSubmissionById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestSubmission | null>>>;
  findSubmissionsByContest: ReturnType<
    typeof vi.fn<
      (contestId: string, page: number, limit: number) => Promise<{ submissions: ContestSubmission[]; total: number }>
    >
  >;
  findSubmissionByContestAndAuthor: ReturnType<
    typeof vi.fn<(contestId: string, authorId: string) => Promise<ContestSubmission | null>>
  >;
  createSubmission: ReturnType<typeof vi.fn<(data: CreateSubmissionInput) => Promise<ContestSubmission>>>;
  reviewSubmission: ReturnType<
    typeof vi.fn<(id: string, status: string, reviewedBy: string) => Promise<ContestSubmission>>
  >;
  findVoteById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestVote | null>>>;
  findVoteByUserContestSubmission: ReturnType<
    typeof vi.fn<(contestId: string, submissionId: string, userId: string) => Promise<ContestVote | null>>
  >;
  countVotesBySubmission: ReturnType<typeof vi.fn<(submissionId: string) => Promise<number>>>;
  castVote: ReturnType<typeof vi.fn<(data: CastVoteInput) => Promise<ContestVote>>>;
  findPrizeById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestPrize | null>>>;
  createPrize: ReturnType<typeof vi.fn<(data: DistributePrizeInput) => Promise<ContestPrize>>>;
  findWinningSubmission: ReturnType<typeof vi.fn<(contestId: string) => Promise<ContestSubmission | null>>>;
  findPrizesByContest: ReturnType<typeof vi.fn<(contestId: string) => Promise<ContestPrize[]>>>;
  findVotesBySubmission: ReturnType<typeof vi.fn<(submissionId: string) => Promise<ContestVote[]>>>;
  findVotesByContest: ReturnType<
    typeof vi.fn<(contestId: string, limit: number, offset: number) => Promise<ContestVote[]>>
  >;
  countVotesByContest: ReturnType<typeof vi.fn<(contestId: string) => Promise<{ total: string }>>>;
  findCategoriesByIds: ReturnType<typeof vi.fn<(categoryIds: string[]) => Promise<ContestCategorySummary[]>>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

describe('ContestsService', () => {
  let contestsService: ContestsService;
  let contestsRepository: MockContestsRepository;
  let logger: MockWinstonLoggerService;
  let cache: FakeTaggedCache;
  let eventValidatorService: MockEventValidatorService;

  const mockContest: Contest = {
    id: 'contest-123',
    title: 'Test Contest',
    description: 'A test contest',
    categoryId: null,
    // RELATIVE TO NOW, deliberately. These were hard-coded to 2024 dates, which is in the past, so
    // they only ever described a contest whose window had already closed — and nothing noticed,
    // because no code compared `end_date` against a clock. `castVote` does now, so a fixture whose
    // deadline has passed is correctly refused; these are the dates for a contest a reader can still
    // vote in.
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    submissionDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    status: 'draft',
    createdBy: 'user-123',
    winnerId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockSubmission: ContestSubmission = {
    id: 'submission-123',
    contestId: 'contest-123',
    storyId: 'story-123',
    authorId: 'author-123',
    // 'approved', not 'pending': `castVote` refuses anything the organiser has not approved, and the
    // default a submission is created with is 'pending'. A rejected submission keeps its row and its
    // id, so nothing else stopped a vote for one.
    status: 'approved',
    submittedAt: new Date('2024-01-15'),
    reviewedAt: null,
    reviewedBy: null,
  };

  beforeEach(() => {
    contestsRepository = {
      findContestById: vi.fn<(id: string) => Promise<Contest | null>>(),
      findAllContests:
        vi.fn<
          (params: {
            page?: number;
            limit?: number;
            categoryId?: string;
            status?: string;
            search?: string;
          }) => Promise<{ contests: Contest[]; total: number }>
        >(),
      createContest: vi.fn<(data: CreateContestInput & { createdBy: string; status: string }) => Promise<Contest>>(),
      updateContest: vi.fn<(id: string, data: UpdateContestInput) => Promise<Contest>>(),
      findSubmissionById: vi.fn<(id: string) => Promise<ContestSubmission | null>>(),
      findSubmissionsByContest:
        vi.fn<
          (
            contestId: string,
            page: number,
            limit: number,
          ) => Promise<{ submissions: ContestSubmission[]; total: number }>
        >(),
      findSubmissionByContestAndAuthor:
        vi.fn<(contestId: string, authorId: string) => Promise<ContestSubmission | null>>(),
      createSubmission: vi.fn<(data: CreateSubmissionInput) => Promise<ContestSubmission>>(),
      reviewSubmission: vi.fn<(id: string, status: string, reviewedBy: string) => Promise<ContestSubmission>>(),
      findVoteById: vi.fn<(id: string) => Promise<ContestVote | null>>(),
      findVoteByUserContestSubmission:
        vi.fn<(contestId: string, submissionId: string, userId: string) => Promise<ContestVote | null>>(),
      countVotesBySubmission: vi.fn<(submissionId: string) => Promise<number>>(),
      castVote: vi.fn<(data: CastVoteInput) => Promise<ContestVote>>(),
      findPrizeById: vi.fn<(id: string) => Promise<ContestPrize | null>>(),
      createPrize: vi.fn<(data: DistributePrizeInput) => Promise<ContestPrize>>(),
      findWinningSubmission: vi.fn<(contestId: string) => Promise<ContestSubmission | null>>(),
      findPrizesByContest: vi.fn<(contestId: string) => Promise<ContestPrize[]>>(),
      findVotesBySubmission: vi.fn<(submissionId: string) => Promise<ContestVote[]>>(),
      findVotesByContest: vi.fn<(contestId: string, limit: number, offset: number) => Promise<ContestVote[]>>(),
      countVotesByContest: vi.fn<(contestId: string) => Promise<{ total: string }>>(),
      findCategoriesByIds: vi.fn<(categoryIds: string[]) => Promise<ContestCategorySummary[]>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    cache = new FakeTaggedCache();
    vi.mocked(contestsRepository.findCategoriesByIds).mockResolvedValue([]);

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    contestsService = new ContestsService(
      contestsRepository,
      logger as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('create', () => {
    it('should create a contest successfully', async () => {
      vi.mocked(contestsRepository.findAllContests).mockResolvedValue({ contests: [], total: 0 });
      vi.mocked(contestsRepository.createContest).mockResolvedValue(mockContest);

      const result = await contestsService.create('user-123', {
        title: 'Test Contest',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        submissionDeadline: new Date('2024-06-30'),
      });

      expect(result).toHaveProperty('id', 'contest-123');
      expect(result.title).toBe('Test Contest');
      expect(result.status).toBe('draft');
      expect(contestsRepository.createContest).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Contest',
          createdBy: 'user-123',
          status: 'draft',
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('contest.created', expect.any(Object));
    });

    it('should throw ConflictException when title already exists', async () => {
      vi.mocked(contestsRepository.findAllContests).mockResolvedValue({ contests: [mockContest], total: 1 });

      await expect(
        contestsService.create('user-123', {
          title: 'Test Contest',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
          submissionDeadline: new Date('2024-06-30'),
        }),
      ).rejects.toThrow('Contest title already exists');
    });
  });

  describe('findById', () => {
    it('should return a contest by id', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);

      const result = await contestsService.findById('contest-123');

      expect(result).toMatchObject({ id: 'contest-123', title: 'Test Contest', status: 'draft' });
      expect(contestsRepository.findContestById).toHaveBeenCalledWith('contest-123');
    });

    it('should return cached contest', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);
      await contestsService.findById('contest-123');
      // The first call populated the cache; the repository must not be consulted again.
      vi.mocked(contestsRepository.findContestById).mockClear();

      const result = await contestsService.findById('contest-123');

      expect(result.id).toBe('contest-123');
      expect(result.title).toBe('Test Contest');
      expect(contestsRepository.findContestById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.findById('contest-999')).rejects.toThrow('Contest not found');
    });

    /**
     * The regression this module was fixed for, through a real serialize → deserialize round trip.
     * The second call is served by an entry that went through `JSON.stringify` and `JSON.parse`,
     * which is what the cache actually hands back.
     *
     * Without revival the warm value carries ISO strings in fields typed `Date`, and the response
     * mapper — the very thing that builds the HTTP payload — dies with
     * `TypeError: startDate.toISOString is not a function` on every cached key while the first
     * request succeeds. The `.toISOString()` assertions are the point: checking `instanceof` alone
     * would not reproduce the failure the client saw.
     */
    it('returns ISO date strings on a cache hit, so the response mapper cannot fail', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);

      const cold = await contestsService.findById('contest-123');
      const warm = await contestsService.findById('contest-123');

      expect(warm.startDate).toBe(cold.startDate);
      expect(warm.endDate).toBe(cold.endDate);
      expect(warm.submissionDeadline).toBe(cold.submissionDeadline);

      // Compared against the FIXTURE rather than a literal, because `mockContest`'s dates are
      // relative to now. A hard-coded 2024 expectation here would have passed only until the calendar
      // moved past it — which is the same mistake the fixture itself had, and why nothing noticed that
      // no code compared `end_date` against a clock.
      expect(warm.startDate).toBe(mockContest.startDate.toISOString());
      expect(warm.endDate).toBe(mockContest.endDate.toISOString());
      expect(warm.submissionDeadline).toBe(mockContest.submissionDeadline.toISOString());
      expect(warm.createdAt).toBe(mockContest.createdAt.toISOString());
      expect(warm.updatedAt).toBe(mockContest.updatedAt.toISOString());
    });

    it('drops an un-revivable cache entry and reloads instead of throwing', async () => {
      // `createdAt: null` cannot be the row that was cached — the column is `notNull` — so the
      // entry is corrupt and must heal into a miss rather than become a 500.
      cache.seedRaw(CONTEST_CACHE_NAMESPACE, 'contest-123', JSON.stringify({ ...mockContest, createdAt: null }));
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);

      const result = await contestsService.findById('contest-123');

      expect(result.createdAt).toBe(mockContest.createdAt.toISOString());
      expect(contestsRepository.findContestById).toHaveBeenCalledTimes(1);
    });

    it('drops an unparseable cache entry and reloads instead of throwing', async () => {
      cache.seedRaw(CONTEST_CACHE_NAMESPACE, 'contest-123', '{ this is not json');
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);

      const result = await contestsService.findById('contest-123');

      expect(result.id).toBe('contest-123');
    });

    it('resolves the category name instead of handing the client a UUID', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, categoryId: 'cat-1' });
      vi.mocked(contestsRepository.findCategoriesByIds).mockResolvedValue([{ id: 'cat-1', name: 'Speculative' }]);

      const result = await contestsService.findById('contest-123');

      expect(result.categoryId).toBe('cat-1');
      expect(result.category).toBe('Speculative');
    });

    it('reports a null category when the category row no longer exists', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, categoryId: 'cat-gone' });
      vi.mocked(contestsRepository.findCategoriesByIds).mockResolvedValue([]);

      const result = await contestsService.findById('contest-123');

      expect(result.categoryId).toBe('cat-gone');
      expect(result.category).toBeNull();
    });

    it('does not query categories for a contest that has none', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);

      const result = await contestsService.findById('contest-123');

      expect(result.category).toBeNull();
      expect(contestsRepository.findCategoriesByIds).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated contests', async () => {
      vi.mocked(contestsRepository.findAllContests).mockResolvedValue({ contests: [mockContest], total: 1 });

      const result = await contestsService.findAll({ page: 1, limit: 20 });

      expect(result.contests).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should apply filters', async () => {
      vi.mocked(contestsRepository.findAllContests).mockResolvedValue({ contests: [], total: 0 });

      await contestsService.findAll({ page: 2, limit: 10, categoryId: 'cat-123', status: 'active', search: 'test' });

      expect(contestsRepository.findAllContests).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        categoryId: 'cat-123',
        status: 'active',
        search: 'test',
      });
    });

    it('resolves every category on the page with a single query', async () => {
      vi.mocked(contestsRepository.findAllContests).mockResolvedValue({
        contests: [
          { ...mockContest, id: 'c1', categoryId: 'cat-1' },
          { ...mockContest, id: 'c2', categoryId: 'cat-1' },
          { ...mockContest, id: 'c3', categoryId: 'cat-2' },
          { ...mockContest, id: 'c4', categoryId: null },
        ],
        total: 4,
      });
      vi.mocked(contestsRepository.findCategoriesByIds).mockResolvedValue([
        { id: 'cat-1', name: 'Speculative' },
        { id: 'cat-2', name: 'Historical' },
      ]);

      const result = await contestsService.findAll({ page: 1, limit: 20 });

      // Two contests share a category; the ids are de-duplicated so one query answers the page.
      expect(contestsRepository.findCategoriesByIds).toHaveBeenCalledTimes(1);
      expect(contestsRepository.findCategoriesByIds).toHaveBeenCalledWith(['cat-1', 'cat-2']);
      expect(result.contests.map((contest) => contest.category)).toEqual([
        'Speculative',
        'Speculative',
        'Historical',
        null,
      ]);
    });

    it('issues no category query for a page where no contest has a category', async () => {
      vi.mocked(contestsRepository.findAllContests).mockResolvedValue({ contests: [mockContest], total: 1 });

      const result = await contestsService.findAll({ page: 1, limit: 20 });

      expect(contestsRepository.findCategoriesByIds).not.toHaveBeenCalled();
      expect(result.contests[0]?.category).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a contest successfully', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...mockContest, title: 'Updated Contest' });

      const result = await contestsService.update('contest-123', { title: 'Updated Contest' }, 'user-123');

      expect(result.title).toBe('Updated Contest');
      expect(contestsRepository.updateContest).toHaveBeenCalledWith(
        'contest-123',
        expect.objectContaining({ title: 'Updated Contest' }),
      );
      expect(cache.invalidations).toContainEqual({
        namespace: CONTEST_CACHE_NAMESPACE,
        key: 'contest-123',
        tags: ['contests'],
      });
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.update('contest-999', { title: 'New Title' }, 'user-123')).rejects.toThrow(
        'Contest not found',
      );
    });

    it('should throw ForbiddenException when contest is completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.update('contest-123', { title: 'New Title' }, 'user-123')).rejects.toThrow(
        'Cannot update a completed or cancelled contest',
      );
    });
  });

  describe('start', () => {
    it('should start a draft contest', async () => {
      const draftContest = { ...mockContest, status: 'draft' };
      const startedContest = { ...draftContest, status: 'active' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(draftContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue(startedContest);

      const result = await contestsService.start('contest-123', 'user-123');

      expect(result.status).toBe('active');
      expect(contestsRepository.updateContest).toHaveBeenCalledWith('contest-123', { status: 'active' });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('contest.started', { contestId: 'contest-123' });
    });

    it('should throw ForbiddenException when contest is not in draft', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.start('contest-123', 'user-123')).rejects.toThrow('Contest is not in draft status');
    });
  });

  describe('cancel', () => {
    it('should cancel an active contest', async () => {
      const activeContest = { ...mockContest, status: 'active' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(activeContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...activeContest, status: 'cancelled' });

      const result = await contestsService.cancel('contest-123', 'user-123');

      expect(result.status).toBe('cancelled');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('contest.cancelled', { contestId: 'contest-123' });
    });

    it('should throw ForbiddenException when contest is already completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.cancel('contest-123', 'user-123')).rejects.toThrow(
        'Cannot cancel a completed or already cancelled contest',
      );
    });
  });

  describe('complete', () => {
    it('should complete a voting contest', async () => {
      const votingContest = { ...mockContest, status: 'voting' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findWinningSubmission).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({
        ...votingContest,
        status: 'completed',
        winnerId: 'author-123',
      });

      const result = await contestsService.complete('contest-123', 'user-123');

      expect(result.status).toBe('completed');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('contest.completed', expect.any(Object));
    });

    it('should throw ForbiddenException when contest is already completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.complete('contest-123', 'user-123')).rejects.toThrow(
        'Cannot complete an already completed or cancelled contest',
      );
    });
  });

  describe('submitStory', () => {
    it('should submit a story to a contest', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        const activeContest = { ...mockContest, status: 'active' };

        vi.mocked(contestsRepository.findContestById).mockResolvedValue(activeContest);
        vi.mocked(contestsRepository.findSubmissionByContestAndAuthor).mockResolvedValue(null);
        vi.mocked(contestsRepository.createSubmission).mockResolvedValue(mockSubmission);

        const result = await contestsService.submitStory('contest-123', 'user-123', 'story-123', 'user-123');

        expect(result).toEqual(mockSubmission);
        expect(contestsRepository.createSubmission).toHaveBeenCalledWith({
          contestId: 'contest-123',
          storyId: 'story-123',
          authorId: 'user-123',
        });
        expect(eventValidatorService.emit).toHaveBeenCalledWith('submission.submitted', expect.any(Object));
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

        await expect(contestsService.submitStory('contest-999', 'user-123', 'story-123', 'user-123')).rejects.toThrow(
          'Contest not found',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw ForbiddenException when contest is not active', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'draft' });

        await expect(contestsService.submitStory('contest-123', 'user-123', 'story-123', 'user-123')).rejects.toThrow(
          'Contest is not accepting submissions',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw ConflictException when author already submitted', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        const activeContest = { ...mockContest, status: 'active' };
        vi.mocked(contestsRepository.findContestById).mockResolvedValue(activeContest);
        vi.mocked(contestsRepository.findSubmissionByContestAndAuthor).mockResolvedValue(mockSubmission);

        await expect(contestsService.submitStory('contest-123', 'user-123', 'story-123', 'user-123')).rejects.toThrow(
          'You have already submitted a story to this contest',
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getSubmissions', () => {
    it('should return submissions for a contest', async () => {
      vi.mocked(contestsRepository.findSubmissionsByContest).mockResolvedValue({
        submissions: [mockSubmission],
        total: 1,
      });

      const result = await contestsService.getSubmissions('contest-123', 1, 20);

      expect(result.submissions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(contestsRepository.findSubmissionsByContest).toHaveBeenCalledWith('contest-123', 1, 20);
    });
  });

  describe('approveSubmission', () => {
    it('should approve a submission', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });
      vi.mocked(contestsRepository.reviewSubmission).mockResolvedValue({ ...mockSubmission, status: 'approved' });

      const result = await contestsService.approveSubmission('submission-123', 'contest-123', 'user-123');

      expect(result.status).toBe('approved');
      expect(contestsRepository.reviewSubmission).toHaveBeenCalledWith('submission-123', 'approved', 'user-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('submission.approved', expect.any(Object));
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(null);

      await expect(contestsService.approveSubmission('submission-999', 'contest-123', 'user-123')).rejects.toThrow(
        'Submission not found',
      );
    });
  });

  describe('rejectSubmission', () => {
    it('should reject a submission', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      // The method used to load NO contest at all — so this mock did not exist — which is exactly why
      // it accepted a submission against a contest id that need not exist. It loads one now, checks
      // the caller owns it, and checks the state.
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });
      vi.mocked(contestsRepository.reviewSubmission).mockResolvedValue({ ...mockSubmission, status: 'rejected' });

      const result = await contestsService.rejectSubmission('submission-123', 'contest-123', 'user-123');

      expect(result.status).toBe('rejected');
      expect(contestsRepository.reviewSubmission).toHaveBeenCalledWith('submission-123', 'rejected', 'user-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('submission.rejected', expect.any(Object));
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(null);

      await expect(contestsService.rejectSubmission('submission-999', 'contest-123', 'user-123')).rejects.toThrow(
        'Submission not found',
      );
    });
  });

  describe('castVote', () => {
    it('should cast a vote successfully', async () => {
      const votingContest = { ...mockContest, status: 'voting' };
      const vote: ContestVote = {
        id: 'vote-123',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        userId: 'user-123',
        createdAt: new Date(),
      };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      // `castVote` now loads the submission: a self-vote, a submission from another contest and a
      // submission the organiser rejected all used to be votable, because nothing looked it up at all.
      // `mockSubmission.authorId` is 'author-123' and this voter is 'user-123', so this is a
      // legitimate vote by somebody else.
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.findVoteByUserContestSubmission).mockResolvedValue(null);
      vi.mocked(contestsRepository.castVote).mockResolvedValue(vote);

      const result = await contestsService.castVote('contest-123', 'submission-123', 'user-123');

      expect(result).toEqual(vote);
      expect(eventValidatorService.emit).toHaveBeenCalledWith('vote.cast', expect.any(Object));
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.castVote('contest-999', 'submission-123', 'user-123')).rejects.toThrow(
        'Contest not found',
      );
    });

    it('should throw ForbiddenException when contest is not in voting phase', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow(
        'Voting is not currently open for this contest',
      );
    });

    it('should throw ConflictException when user already voted', async () => {
      const votingContest = { ...mockContest, status: 'voting' };
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      // The submission is resolved BEFORE the duplicate check, because self-voting, a foreign
      // submission and a rejected one are all refused first. So a legitimate duplicate needs it too.
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.findVoteByUserContestSubmission).mockResolvedValue({
        id: 'vote-123',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        userId: 'user-123',
        createdAt: new Date(),
      });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow(
        'You have already voted for this submission',
      );
    });
  });

  describe('selectWinner', () => {
    it('should select a winner for a contest', async () => {
      const votingContest = { ...mockContest, status: 'voting' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({
        ...votingContest,
        status: 'completed',
        winnerId: 'author-123',
      });

      // The fourth argument is new, and it is the whole authorization: the signature had no caller
      // at all, so any authenticated account could end a contest it did not own and name its own
      // submission as the winner.
      const result = await contestsService.selectWinner('contest-123', 'submission-123', 'author-123', 'user-123');

      expect(result.status).toBe('completed');
      expect(result.winnerId).toBe('author-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('winner.selected', expect.any(Object));
      expect(eventValidatorService.emit).toHaveBeenCalledWith('contest.completed', expect.any(Object));
    });

    it('should throw ForbiddenException when winner is not the submission author', async () => {
      const votingContest = { ...mockContest, status: 'voting' };
      const otherSubmission = { ...mockSubmission, authorId: 'other-author' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(otherSubmission);

      await expect(
        contestsService.selectWinner('contest-123', 'submission-123', 'author-123', 'user-123'),
      ).rejects.toThrow('Winner must be the author of the selected submission');
    });

    it('should throw ForbiddenException when contest is not in voting phase', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(
        contestsService.selectWinner('contest-123', 'submission-123', 'author-123', 'user-123'),
      ).rejects.toThrow('Contest is not in voting phase');
    });
  });

  describe('distributePrize', () => {
    it('should distribute a prize successfully', async () => {
      const completedContest = { ...mockContest, status: 'completed' };
      const prize = {
        id: 'prize-123',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        winnerId: 'author-123',
        prizeType: 'cash',
        prizeDescription: '$100',
        distributedAt: new Date(),
        amount: null,
        currency: null,
        createdAt: new Date(),
      };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(completedContest);
      vi.mocked(contestsRepository.createPrize).mockResolvedValue(prize);

      // The sixth argument is new. A prize is a disbursement against the contest's own budget, so
      // "who authorised this" is the first question, and it was unasked.
      const result = await contestsService.distributePrize(
        'contest-123',
        'submission-123',
        'author-123',
        'cash',
        '$100',
        'user-123',
      );

      expect(result).toEqual(prize);
      expect(eventValidatorService.emit).toHaveBeenCalledWith('prize.distributed', expect.any(Object));
    });

    it('should throw ForbiddenException when contest is not completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(
        contestsService.distributePrize('contest-123', 'submission-123', 'author-123', 'cash', null, 'user-123'),
      ).rejects.toThrow('Contest must be completed before distributing prizes');
    });
  });

  /**
   * THE AUTHORIZATION THAT WAS NOT THERE.
   *
   * `selectWinner` and `distributePrize` did not take a caller identity at all, so nothing about WHO
   * was asking was recorded, let alone checked: any authenticated account could end a contest it did
   * not own and mint a prize against it. `rejectSubmission` checked nothing beyond the submission
   * existing — not the contest, not the state, not the owner.
   *
   * `ForbiddenException` appeared twenty-five times in this service and every one of them was a STATE
   * check. The word "own" appears in the lifecycle messages and nowhere else, which is the shape of the
   * gap: the routes that decide a winner and a disbursement were the only mutating ones without it.
   */
  describe('contest ownership on the decisive routes', () => {
    const votingContest = { ...mockContest, status: 'voting' };
    const completedContest = { ...mockContest, status: 'completed' };

    beforeEach(() => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
    });

    it('should refuse a winner selection from someone who does not own the contest', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);

      await expect(
        contestsService.selectWinner('contest-123', 'submission-123', 'author-123', 'an-intruder'),
      ).rejects.toThrow('You can only select a winner for your own contests');

      expect(contestsRepository.updateContest).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalledWith('winner.selected', expect.any(Object));
    });

    it('should refuse a prize distribution from someone who does not own the contest', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(completedContest);

      await expect(
        contestsService.distributePrize('contest-123', 'submission-123', 'author-123', 'cash', '$100', 'an-intruder'),
      ).rejects.toThrow('You can only distribute a prize for your own contests');

      expect(contestsRepository.createPrize).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalledWith('prize.distributed', expect.any(Object));
    });

    it('should refuse an approval from someone who does not own the contest', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.approveSubmission('submission-123', 'contest-123', 'an-intruder')).rejects.toThrow(
        'You can only review submissions for your own contests',
      );

      expect(contestsRepository.reviewSubmission).not.toHaveBeenCalled();
    });

    it('should refuse a rejection from someone who does not own the contest', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.rejectSubmission('submission-123', 'contest-123', 'an-intruder')).rejects.toThrow(
        'You can only review submissions for your own contests',
      );

      expect(contestsRepository.reviewSubmission).not.toHaveBeenCalled();
    });

    it('should refuse a submission reviewed through a contest it does not belong to', async () => {
      // Both the submission and a real contest were checked, and nothing connected them: a
      // submission id from contest A approved through contest B recorded the reviewer against B and
      // emitted `submission.approved` with B's id.
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({
        ...mockContest,
        id: 'contest-other',
        status: 'active',
      });

      await expect(contestsService.approveSubmission('submission-123', 'contest-other', 'user-123')).rejects.toThrow(
        'Submission not found in this contest',
      );

      expect(contestsRepository.reviewSubmission).not.toHaveBeenCalled();
    });

    it('should refuse a rejection after the contest has completed', async () => {
      // It used to check no state at all, so a submission could be rejected after a winner had been
      // selected and the contest marked complete.
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(completedContest);

      await expect(contestsService.rejectSubmission('submission-123', 'contest-123', 'user-123')).rejects.toThrow(
        'Contest is not in a state to reject submissions',
      );

      expect(contestsRepository.reviewSubmission).not.toHaveBeenCalled();
    });

    it('should refuse a rejection against a contest that does not exist', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.rejectSubmission('submission-123', 'contest-999', 'user-123')).rejects.toThrow(
        'Contest not found',
      );

      expect(contestsRepository.reviewSubmission).not.toHaveBeenCalled();
    });
  });

  /**
   * VOTING INTEGRITY. Three separate ways to influence an outcome, none of which needed the
   * database: vote for your own entry, vote through contest B's route on a submission from contest A,
   * and keep voting after the window closed.
   */
  describe('voting integrity', () => {
    const votingContest = { ...mockContest, status: 'voting' };

    beforeEach(() => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findVoteByUserContestSubmission).mockResolvedValue(null);
    });

    it('should refuse a self-vote, where two entrants and one voter decide the contest', async () => {
      // `contest_votes_unique_idx` is on (contest, submission, user), which stops a DOUBLE vote and
      // not one vote for your own entry. So a two-entrant contest could be won by a single person
      // casting both.
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue({
        ...mockSubmission,
        authorId: 'user-123',
      });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow(
        'You cannot vote for your own submission',
      );

      expect(contestsRepository.castVote).not.toHaveBeenCalled();
    });

    it('should refuse a vote on a submission from another contest', async () => {
      // Nothing connected the submission to the contest, so a submission id from another contest
      // could be voted on through this route: the vote landed against this contest while pointing at
      // somebody else's story.
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue({
        ...mockSubmission,
        contestId: 'contest-other',
      });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow(
        'Submission not found in this contest',
      );

      expect(contestsRepository.castVote).not.toHaveBeenCalled();
    });

    it('should refuse a vote on a rejected submission', async () => {
      // A rejected submission keeps its row and its id, so nothing stopped a vote for something the
      // organiser removed.
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue({
        ...mockSubmission,
        status: 'rejected',
      });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow(
        'Only approved submissions can be voted on',
      );

      expect(contestsRepository.castVote).not.toHaveBeenCalled();
    });

    it('should refuse a vote once end_date has passed, even while status is still voting', async () => {
      // `status === 'voting'` is set when the contest starts and never cleared by the passage of
      // time, so voting stayed open indefinitely until somebody manually moved the contest on.
      // `submitStory` enforced `end_date`, so submissions closed on time while votes did not — the
      // worse half to leave open, because a vote changes a winner.
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({
        ...mockContest,
        status: 'voting',
        endDate: new Date(Date.now() - 1000),
      });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow(
        'Voting has closed for this contest',
      );

      expect(contestsRepository.castVote).not.toHaveBeenCalled();
    });

    it('should accept a legitimate vote inside the window', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.castVote).mockResolvedValue({
        id: 'vote-123',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        userId: 'user-123',
        createdAt: new Date(),
      });

      const vote = await contestsService.castVote('contest-123', 'submission-123', 'user-123');

      expect(vote.id).toBe('vote-123');
      expect(contestsRepository.castVote).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * THE PUBLIC VOTE TALLY NAMED NO VOTER.
   *
   * `GET /contests/:id/votes` is `@Public()` and returned every vote's `userId`, so anyone — with no
   * account — could enumerate which accounts voted for which submission in any contest. On a platform
   * where an account is a person, that is a roster of who engaged with what.
   */
  describe('the public vote tally names no voter', () => {
    it('should not return a userId for a submission-scoped vote list', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.findVotesBySubmission).mockResolvedValue([
        {
          id: 'vote-1',
          contestId: 'contest-123',
          submissionId: 'submission-123',
          userId: 'voter-1',
          createdAt: new Date(),
        },
      ]);

      const result = await contestsService.getVotes('contest-123', 'submission-123', 1, 20);

      expect(result.votes).toHaveLength(1);
      expect(result.votes[0]).not.toHaveProperty('userId');
      expect(result.votes[0]).toMatchObject({ id: 'vote-1', submissionId: 'submission-123' });
    });

    it('should not return a userId for a contest-scoped vote list', async () => {
      vi.mocked(contestsRepository.findVotesByContest).mockResolvedValue([
        {
          id: 'vote-1',
          contestId: 'contest-123',
          submissionId: 'submission-123',
          userId: 'voter-1',
          createdAt: new Date(),
        },
      ]);
      // The repository returns `{ total: string }` — a COUNT over Postgres comes back bigint-ish —
      // and the service does `Number(total)`. A bare number here made it NaN.
      vi.mocked(contestsRepository.countVotesByContest).mockResolvedValue({ total: '1' });

      const result = await contestsService.getVotes('contest-123', undefined, 1, 20);

      // The COUNT is public product behaviour and stays; the identities behind it do not.
      expect(result.total).toBe(1);
      expect(result.votes[0]).not.toHaveProperty('userId');
    });
  });

  /**
   * A PRIZE WITH NO AMOUNT. The table carried `prizeType` plus a prose `prizeDescription` and
   * nothing else, so a cash prize had nowhere to go and no contest total was computable.
   */
  describe('prize amount', () => {
    const completedContest = { ...mockContest, status: 'completed' };

    beforeEach(() => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(completedContest);
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
    });

    it('should record an amount with its currency', async () => {
      vi.mocked(contestsRepository.createPrize).mockResolvedValue({
        id: 'prize-1',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        winnerId: 'author-123',
        prizeType: 'cash',
        prizeDescription: null,
        amount: 500_000,
        currency: 'EGP',
        distributedAt: null,
        createdAt: new Date(),
      });

      await contestsService.distributePrize(
        'contest-123',
        'submission-123',
        'author-123',
        'cash',
        null,
        'user-123',
        500_000,
        'EGP',
      );

      expect(contestsRepository.createPrize).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500_000, currency: 'EGP' }),
      );
    });

    it('should refuse an amount with no currency, rather than writing half a prize', async () => {
      await expect(
        contestsService.distributePrize(
          'contest-123',
          'submission-123',
          'author-123',
          'cash',
          null,
          'user-123',
          500_000,
        ),
      ).rejects.toThrow('must be provided together');

      expect(contestsRepository.createPrize).not.toHaveBeenCalled();
    });

    it('should refuse a currency with no amount', async () => {
      await expect(
        contestsService.distributePrize(
          'contest-123',
          'submission-123',
          'author-123',
          'cash',
          null,
          'user-123',
          null,
          'EGP',
        ),
      ).rejects.toThrow('must be provided together');

      expect(contestsRepository.createPrize).not.toHaveBeenCalled();
    });

    it('should still accept a prize with neither, because a book has no figure', async () => {
      vi.mocked(contestsRepository.createPrize).mockResolvedValue({
        id: 'prize-1',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        winnerId: 'author-123',
        prizeType: 'book',
        prizeDescription: 'A copy of the winning story',
        amount: null,
        currency: null,
        distributedAt: null,
        createdAt: new Date(),
      });

      await contestsService.distributePrize(
        'contest-123',
        'submission-123',
        'author-123',
        'book',
        'A copy of the winning story',
        'user-123',
      );

      expect(contestsRepository.createPrize).toHaveBeenCalledWith(
        expect.objectContaining({ amount: null, currency: null }),
      );
    });
  });

  describe('getPrizes', () => {
    it('should return prizes for a contest', async () => {
      // `amount` and `currency` are on the schema and therefore required by the inferred type, even
      // though they are nullable in the database. A book prize has neither, which is the realistic
      // case and the reason they are not NOT NULL.
      const prize: ContestPrize = {
        id: 'prize-123',
        contestId: 'contest-123',
        submissionId: 'submission-123',
        winnerId: 'author-123',
        amount: null,
        currency: null,
        prizeType: 'cash',
        prizeDescription: '$100',
        distributedAt: new Date(),
        createdAt: new Date(),
      };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);
      vi.mocked(contestsRepository.findPrizesByContest).mockResolvedValue([prize]);

      const result = await contestsService.getPrizes('contest-123');

      expect(result).toHaveLength(1);
      expect(result[0].prizeType).toBe('cash');
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.getPrizes('contest-999')).rejects.toThrow('Contest not found');
    });
  });
});
