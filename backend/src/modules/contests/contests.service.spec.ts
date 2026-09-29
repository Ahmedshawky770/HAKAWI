import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { ContestsService } from './contests.service.ts';
import type { Contest, ContestSubmission, ContestVote, ContestPrize, CreateContestInput, UpdateContestInput, CreateSubmissionInput, CastVoteInput, DistributePrizeInput } from './types.ts';

type MockContestsRepository = {
  findContestById: ReturnType<typeof vi.fn<(id: string) => Promise<Contest | null>>>;
  findAllContests: ReturnType<typeof vi.fn<(params: { page?: number; limit?: number; categoryId?: string; status?: string; search?: string }) => Promise<{ contests: Contest[]; total: number }>>>;
  createContest: ReturnType<typeof vi.fn<(data: CreateContestInput & { createdBy: string; status: string }) => Promise<Contest>>>;
  updateContest: ReturnType<typeof vi.fn<(id: string, data: UpdateContestInput) => Promise<Contest>>>;
  findSubmissionById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestSubmission | null>>>;
  findSubmissionsByContest: ReturnType<typeof vi.fn<(contestId: string, page: number, limit: number) => Promise<{ submissions: ContestSubmission[]; total: number }>>>;
  findSubmissionByContestAndAuthor: ReturnType<typeof vi.fn<(contestId: string, authorId: string) => Promise<ContestSubmission | null>>>;
  createSubmission: ReturnType<typeof vi.fn<(data: CreateSubmissionInput) => Promise<ContestSubmission>>>;
  reviewSubmission: ReturnType<typeof vi.fn<(id: string, status: string, reviewedBy: string) => Promise<ContestSubmission>>>;
  findVoteById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestVote | null>>>;
  findVoteByUserContestSubmission: ReturnType<typeof vi.fn<(contestId: string, submissionId: string, userId: string) => Promise<ContestVote | null>>>;
  countVotesBySubmission: ReturnType<typeof vi.fn<(submissionId: string) => Promise<number>>>;
  castVote: ReturnType<typeof vi.fn<(data: CastVoteInput) => Promise<ContestVote>>>;
  findPrizeById: ReturnType<typeof vi.fn<(id: string) => Promise<ContestPrize | null>>>;
  createPrize: ReturnType<typeof vi.fn<(data: DistributePrizeInput) => Promise<ContestPrize>>>;
  findWinningSubmission: ReturnType<typeof vi.fn<(contestId: string) => Promise<ContestSubmission | null>>>;
  findPrizesByContest: ReturnType<typeof vi.fn<(contestId: string) => Promise<ContestPrize[]>>>;
  findVotesBySubmission: ReturnType<typeof vi.fn<(submissionId: string) => Promise<ContestVote[]>>>;
  findVotesByContest: ReturnType<typeof vi.fn<(contestId: string, limit: number, offset: number) => Promise<ContestVote[]>>>;
  countVotesByContest: ReturnType<typeof vi.fn<(contestId: string) => Promise<{ total: string }>>>;
};

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

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

describe('ContestsService', () => {
  let contestsService: ContestsService;
  let contestsRepository: MockContestsRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventValidatorService: MockEventValidatorService;

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
      findContestById: vi.fn<(id: string) => Promise<Contest | null>>(),
      findAllContests: vi.fn<(params: { page?: number; limit?: number; categoryId?: string; status?: string; search?: string }) => Promise<{ contests: Contest[]; total: number }>>(),
      createContest: vi.fn<(data: CreateContestInput & { createdBy: string; status: string }) => Promise<Contest>>(),
      updateContest: vi.fn<(id: string, data: UpdateContestInput) => Promise<Contest>>(),
      findSubmissionById: vi.fn<(id: string) => Promise<ContestSubmission | null>>(),
      findSubmissionsByContest: vi.fn<(contestId: string, page: number, limit: number) => Promise<{ submissions: ContestSubmission[]; total: number }>>(),
      findSubmissionByContestAndAuthor: vi.fn<(contestId: string, authorId: string) => Promise<ContestSubmission | null>>(),
      createSubmission: vi.fn<(data: CreateSubmissionInput) => Promise<ContestSubmission>>(),
      reviewSubmission: vi.fn<(id: string, status: string, reviewedBy: string) => Promise<ContestSubmission>>(),
      findVoteById: vi.fn<(id: string) => Promise<ContestVote | null>>(),
      findVoteByUserContestSubmission: vi.fn<(contestId: string, submissionId: string, userId: string) => Promise<ContestVote | null>>(),
      countVotesBySubmission: vi.fn<(submissionId: string) => Promise<number>>(),
      castVote: vi.fn<(data: CastVoteInput) => Promise<ContestVote>>(),
      findPrizeById: vi.fn<(id: string) => Promise<ContestPrize | null>>(),
      createPrize: vi.fn<(data: DistributePrizeInput) => Promise<ContestPrize>>(),
      findWinningSubmission: vi.fn<(contestId: string) => Promise<ContestSubmission | null>>(),
      findPrizesByContest: vi.fn<(contestId: string) => Promise<ContestPrize[]>>(),
      findVotesBySubmission: vi.fn<(submissionId: string) => Promise<ContestVote[]>>(),
      findVotesByContest: vi.fn<(contestId: string, limit: number, offset: number) => Promise<ContestVote[]>>(),
      countVotesByContest: vi.fn<(contestId: string) => Promise<{ total: string }>>(),
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

    eventValidatorService = {
    emit: vi.fn(),
    validateEvent: vi.fn(),
  };

    contestsService = new ContestsService(
      contestsRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
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

      const result = await contestsService.update('contest-123', { title: 'Updated Contest' }, 'user-123');

      expect(result.title).toBe('Updated Contest');
      expect(contestsRepository.updateContest).toHaveBeenCalledWith('contest-123', expect.objectContaining({ title: 'Updated Contest' }));
      expect(valkeyService.del).toHaveBeenCalledWith('contest:contest-123');
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue(null);

      await expect(contestsService.update('contest-999', { title: 'New Title' }, 'user-123')).rejects.toThrow('Contest not found');
    });

    it('should throw ForbiddenException when contest is completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.update('contest-123', { title: 'New Title' }, 'user-123')).rejects.toThrow('Cannot update a completed or cancelled contest');
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

      await expect(contestsService.cancel('contest-123', 'user-123')).rejects.toThrow('Cannot cancel a completed or already cancelled contest');
    });
  });

  describe('complete', () => {
    it('should complete a voting contest', async () => {
      const votingContest = { ...mockContest, status: 'voting' };

      vi.mocked(contestsRepository.findContestById).mockResolvedValue(votingContest);
      vi.mocked(contestsRepository.findWinningSubmission).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...votingContest, status: 'completed', winnerId: 'author-123' });

      const result = await contestsService.complete('contest-123', 'user-123');

      expect(result.status).toBe('completed');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('contest.completed', expect.any(Object));
    });

    it('should throw ForbiddenException when contest is already completed', async () => {
      vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'completed' });

      await expect(contestsService.complete('contest-123', 'user-123')).rejects.toThrow('Cannot complete an already completed or cancelled contest');
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

        await expect(contestsService.submitStory('contest-999', 'user-123', 'story-123', 'user-123')).rejects.toThrow('Contest not found');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw ForbiddenException when contest is not active', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15'));
      try {
        vi.mocked(contestsRepository.findContestById).mockResolvedValue({ ...mockContest, status: 'draft' });

        await expect(contestsService.submitStory('contest-123', 'user-123', 'story-123', 'user-123')).rejects.toThrow('Contest is not accepting submissions');
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

        await expect(contestsService.submitStory('contest-123', 'user-123', 'story-123', 'user-123')).rejects.toThrow('You have already submitted a story to this contest');
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

      const result = await contestsService.approveSubmission('submission-123', 'contest-123', 'user-123');

      expect(result.status).toBe('approved');
      expect(contestsRepository.reviewSubmission).toHaveBeenCalledWith('submission-123', 'approved', 'user-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('submission.approved', expect.any(Object));
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(null);

      await expect(contestsService.approveSubmission('submission-999', 'contest-123', 'user-123')).rejects.toThrow('Submission not found');
    });
  });

  describe('rejectSubmission', () => {
    it('should reject a submission', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.reviewSubmission).mockResolvedValue({ ...mockSubmission, status: 'rejected' });

      const result = await contestsService.rejectSubmission('submission-123', 'contest-123', 'user-123');

      expect(result.status).toBe('rejected');
      expect(contestsRepository.reviewSubmission).toHaveBeenCalledWith('submission-123', 'rejected', 'user-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('submission.rejected', expect.any(Object));
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(null);

      await expect(contestsService.rejectSubmission('submission-999', 'contest-123', 'user-123')).rejects.toThrow('Submission not found');
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
      expect(eventValidatorService.emit).toHaveBeenCalledWith('vote.cast', expect.any(Object));
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
      vi.mocked(contestsRepository.findSubmissionById).mockResolvedValue(mockSubmission);
      vi.mocked(contestsRepository.updateContest).mockResolvedValue({ ...votingContest, status: 'completed', winnerId: 'author-123' });

      const result = await contestsService.selectWinner('contest-123', 'submission-123', 'author-123');

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

      await expect(contestsService.selectWinner('contest-123', 'submission-123', 'author-123')).rejects.toThrow('Winner must be the author of the selected submission');
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
      expect(eventValidatorService.emit).toHaveBeenCalledWith('prize.distributed', expect.any(Object));
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
