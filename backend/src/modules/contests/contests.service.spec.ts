import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContestsService } from './contests.service.js';
import type { IContestsRepository } from './interfaces/contests-repository.interface.js';
import { CONTESTS_REPOSITORY } from './interfaces/contests-repository.interface.js';
import type { Contest, ContestSubmission, ContestVote, ContestPrize } from './types.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockContestsRepository = Partial<IContestsRepository>;

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockEventEmitter = {
  emit: ReturnType<typeof vi.fn>;
};

describe('ContestsService', () => {
  let contestsService: ContestsService;
  let contestsRepository: MockContestsRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventEmitter: MockEventEmitter;

  const mockContest: Contest = {
    id: 'contest-123',
    title: 'Test Contest',
    description: 'A test contest',
    categoryId: null,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    submissionDeadline: new Date('2024-06-30'),
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
    status: 'pending',
    submittedAt: new Date('2024-01-15'),
    reviewedAt: null,
    reviewedBy: null,
  };

  beforeEach(() => {
    contestsRepository = {
      findContestById: vi.fn(),
      findAllContests: vi.fn(),
      createContest: vi.fn(),
      updateContest: vi.fn(),
      findSubmissionById: vi.fn(),
      findSubmissionsByContest: vi.fn(),
      findSubmissionByContestAndAuthor: vi.fn(),
      createSubmission: vi.fn(),
      reviewSubmission: vi.fn(),
      findVoteById: vi.fn(),
      findVoteByUserContestSubmission: vi.fn(),
      countVotesBySubmission: vi.fn(),
      castVote: vi.fn(),
      findPrizeById: vi.fn(),
      createPrize: vi.fn(),
      findWinningSubmission: vi.fn(),
      findPrizesByContest: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    valkeyService = {
      exists: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    contestsService = new ContestsService(
      contestsRepository as unknown as IContestsRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventEmitter as unknown as EventEmitter2,
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.created', expect.any(Object));
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
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await contestsService.findById('contest-123');

      expect(result).toEqual(mockContest);
      expect(contestsRepository.findContestById).toHaveBeenCalledWith('contest-123');
    });

    it('should return cached contest', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(mockContest));

      const result = await contestsService.findById('contest-123');

      expect(result.id).toBe('contest-123');
      expect(result.title).toBe('Test Contest');
      expect(contestsRepository.findContestById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      await expect(contestsService.findById('contest-999')).rejects.toThrow('Contest not found');
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
  });

  describe('update', () => {
    it('should update a contest successfully', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(mockContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...mockContest, title: 'Updated Contest' });

      const result = await contestsService.update('contest-123', { title: 'Updated Contest' });

      expect(result.title).toBe('Updated Contest');
      expect(contestsRepository.updateContest).toHaveBeenCalledWith('contest-123', expect.objectContaining({ title: 'Updated Contest' }));
      expect(valkeyService.del).toHaveBeenCalledWith('contest:contest-123');
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.update('contest-999', { title: 'New Title' })).rejects.toThrow('Contest not found');
    });

    it('should throw ForbiddenException when contest is completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.update('contest-123', { title: 'New Title' })).rejects.toThrow('Cannot update a completed or cancelled contest');
    });
  });

  describe('start', () => {
    it('should start a draft contest', async () => {
      const draftContest = { ...mockContest, status: 'draft' };
      const startedContest = { ...draftContest, status: 'active' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(draftContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue(startedContest);

      const result = await contestsService.start('contest-123');

      expect(result.status).toBe('active');
      expect(contestsRepository.updateContest).toHaveBeenCalledWith('contest-123', { status: 'active' });
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.started', { contestId: 'contest-123' });
    });

    it('should throw ForbiddenException when contest is not in draft', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.start('contest-123')).rejects.toThrow('Contest is not in draft status');
    });
  });

  describe('cancel', () => {
    it('should cancel an active contest', async () => {
      const activeContest = { ...mockContest, status: 'active' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(activeContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...activeContest, status: 'cancelled' });

      const result = await contestsService.cancel('contest-123');

      expect(result.status).toBe('cancelled');
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.cancelled', { contestId: 'contest-123' });
    });

    it('should throw ForbiddenException when contest is already completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.cancel('contest-123')).rejects.toThrow('Cannot cancel a completed or already cancelled contest');
    });
  });

  describe('complete', () => {
    it('should complete a voting contest', async () => {
      const votingContest = { ...mockContest, status: 'voting' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findWinningSubmission).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...votingContest, status: 'completed', winnerId: 'author-123' });

      const result = await contestsService.complete('contest-123');

      expect(result.status).toBe('completed');
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.completed', expect.any(Object));
    });

    it('should throw ForbiddenException when contest is already completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.complete('contest-123')).rejects.toThrow('Cannot complete an already completed or cancelled contest');
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

        const result = await contestsService.submitStory('contest-123', 'author-123', 'story-123');

        expect(result).toEqual(mockSubmission);
        expect(contestsRepository.createSubmission).toHaveBeenCalledWith({
          contestId: 'contest-123',
          storyId: 'story-123',
          authorId: 'author-123',
        });
        expect(eventEmitter.emit).toHaveBeenCalledWith('submission.submitted', expect.any(Object));
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

        await expect(contestsService.submitStory('contest-999', 'author-123', 'story-123')).rejects.toThrow('Contest not found');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw ForbiddenException when contest is not active', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'draft' });

        await expect(contestsService.submitStory('contest-123', 'author-123', 'story-123')).rejects.toThrow('Contest is not accepting submissions');
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

        await expect(contestsService.submitStory('contest-123', 'author-123', 'story-123')).rejects.toThrow('You have already submitted a story to this contest');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getSubmissions', () => {
    it('should return submissions for a contest', async () => {
      vi.mocked(contestsRepository.findSubmissionsByContest).mockResolvedValue({ submissions: [mockSubmission], total: 1 });

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

      const result = await contestsService.approveSubmission('submission-123', 'contest-123');

      expect(result.status).toBe('approved');
      expect(contestsRepository.reviewSubmission).toHaveBeenCalledWith('submission-123', 'approved', 'contest-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('submission.approved', expect.any(Object));
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(null);

      await expect(contestsService.approveSubmission('submission-999', 'contest-123')).rejects.toThrow('Submission not found');
    });
  });

  describe('rejectSubmission', () => {
    it('should reject a submission', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.reviewSubmission).mockResolvedValue({ ...mockSubmission, status: 'rejected' });

      const result = await contestsService.rejectSubmission('submission-123', 'contest-123');

      expect(result.status).toBe('rejected');
      expect(eventEmitter.emit).toHaveBeenCalledWith('submission.rejected', expect.any(Object));
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(null);

      await expect(contestsService.rejectSubmission('submission-999', 'contest-123')).rejects.toThrow('Submission not found');
    });
  });

  describe('castVote', () => {
    it('should cast a vote successfully', async () => {
      const votingContest = { ...mockContest, status: 'voting' };
      const vote: ContestVote = { id: 'vote-123', contestId: 'contest-123', submissionId: 'submission-123', userId: 'user-123', createdAt: new Date() };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findVoteByUserContestSubmission).mockResolvedValue(null);
      vi.mocked(contestsRepository.castVote).mockResolvedValue(vote);

      const result = await contestsService.castVote('contest-123', 'submission-123', 'user-123');

      expect(result).toEqual(vote);
      expect(eventEmitter.emit).toHaveBeenCalledWith('vote.cast', expect.any(Object));
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.castVote('contest-999', 'submission-123', 'user-123')).rejects.toThrow('Contest not found');
    });

    it('should throw ForbiddenException when contest is not in voting phase', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow('Voting is not currently open for this contest');
    });

    it('should throw ConflictException when user already voted', async () => {
      const votingContest = { ...mockContest, status: 'voting' };
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findVoteByUserContestSubmission).mockResolvedValue({ id: 'vote-123', contestId: 'contest-123', submissionId: 'submission-123', userId: 'user-123', createdAt: new Date() });

      await expect(contestsService.castVote('contest-123', 'submission-123', 'user-123')).rejects.toThrow('You have already voted for this submission');
    });
  });

  describe('selectWinner', () => {
    it('should select a winner for a contest', async () => {
      const votingContest = { ...mockContest, status: 'voting' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...votingContest, status: 'completed', winnerId: 'author-123' });

      const result = await contestsService.selectWinner('contest-123', 'submission-123', 'author-123');

      expect(result.status).toBe('completed');
      expect(result.winnerId).toBe('author-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('winner.selected', expect.any(Object));
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.completed', expect.any(Object));
    });

    it('should throw ForbiddenException when contest is not in voting phase', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.selectWinner('contest-123', 'submission-123', 'author-123')).rejects.toThrow('Contest is not in voting phase');
    });
  });

  describe('distributePrize', () => {
    it('should distribute a prize successfully', async () => {
      const completedContest = { ...mockContest, status: 'completed' };
      const prize = { id: 'prize-123', contestId: 'contest-123', submissionId: 'submission-123', winnerId: 'author-123', prizeType: 'cash', prizeDescription: '$100', distributedAt: new Date(), createdAt: new Date() };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(completedContest);
      vi.mocked(contestsRepository.createPrize).mockResolvedValue(prize);

      const result = await contestsService.distributePrize('contest-123', 'submission-123', 'author-123', 'cash', '$100');

      expect(result).toEqual(prize);
      expect(eventEmitter.emit).toHaveBeenCalledWith('prize.distributed', expect.any(Object));
    });

    it('should throw ForbiddenException when contest is not completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'active' });

      await expect(contestsService.distributePrize('contest-123', 'submission-123', 'author-123', 'cash')).rejects.toThrow('Contest must be completed before distributing prizes');
    });
  });

  describe('getPrizes', () => {
    it('should return prizes for a contest', async () => {
      const prize: ContestPrize = { id: 'prize-123', contestId: 'contest-123', submissionId: 'submission-123', winnerId: 'author-123', prizeType: 'cash', prizeDescription: '$100', distributedAt: new Date(), createdAt: new Date() };

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
