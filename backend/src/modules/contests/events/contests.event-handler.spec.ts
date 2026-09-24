import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContestsEventHandler } from './contests.event-handler.js';
import type { IContestsRepository } from '../interfaces/contests-repository.interface.js';
import { CONTESTS_REPOSITORY } from '../interfaces/contests-repository.interface.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

type MockContestsRepository = Partial<IContestsRepository>;

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

describe('ContestsEventHandler', () => {
  let contestsEventHandler: ContestsEventHandler;
  let contestsRepository: MockContestsRepository;
  let logger: MockWinstonLoggerService;

  beforeEach(() => {
    contestsRepository = {};
    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    contestsEventHandler = new ContestsEventHandler(
      contestsRepository as unknown as IContestsRepository,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('handleContestCreated', () => {
    it('should log contest created event', async () => {
      await contestsEventHandler.handleContestCreated({ contestId: 'contest-123', createdBy: 'user-123' });

      expect(logger.info).toHaveBeenCalledWith('Contest created: contest-123 by user user-123', 'ContestsEventHandler');
    });
  });

  describe('handleContestStarted', () => {
    it('should log contest started event', async () => {
      await contestsEventHandler.handleContestStarted({ contestId: 'contest-123' });

      expect(logger.info).toHaveBeenCalledWith('Contest started: contest-123', 'ContestsEventHandler');
    });
  });

  describe('handleContestCompleted', () => {
    it('should log contest completed event', async () => {
      await contestsEventHandler.handleContestCompleted({ contestId: 'contest-123', winnerId: 'user-456' });

      expect(logger.info).toHaveBeenCalledWith('Contest completed: contest-123, winner: user-456', 'ContestsEventHandler');
    });
  });

  describe('handleSubmissionSubmitted', () => {
    it('should log submission submitted event', async () => {
      await contestsEventHandler.handleSubmissionSubmitted({ submissionId: 'sub-123', contestId: 'contest-123', authorId: 'author-123' });

      expect(logger.info).toHaveBeenCalledWith('Submission submitted: sub-123 for contest contest-123 by author author-123', 'ContestsEventHandler');
    });
  });

  describe('handleSubmissionApproved', () => {
    it('should log submission approved event', async () => {
      await contestsEventHandler.handleSubmissionApproved({ submissionId: 'sub-123', contestId: 'contest-123', authorId: 'author-123' });

      expect(logger.info).toHaveBeenCalledWith('Submission approved: sub-123 for contest contest-123', 'ContestsEventHandler');
    });
  });

  describe('handleSubmissionRejected', () => {
    it('should log submission rejected event', async () => {
      await contestsEventHandler.handleSubmissionRejected({ submissionId: 'sub-123', contestId: 'contest-123', authorId: 'author-123' });

      expect(logger.info).toHaveBeenCalledWith('Submission rejected: sub-123 for contest contest-123', 'ContestsEventHandler');
    });
  });

  describe('handleVoteCast', () => {
    it('should log vote cast event', async () => {
      await contestsEventHandler.handleVoteCast({ voteId: 'vote-123', contestId: 'contest-123', submissionId: 'sub-123', userId: 'user-123' });

      expect(logger.info).toHaveBeenCalledWith('Vote cast: vote-123 by user user-123 for submission sub-123 in contest contest-123', 'ContestsEventHandler');
    });
  });

  describe('handleWinnerSelected', () => {
    it('should log winner selected event', async () => {
      await contestsEventHandler.handleWinnerSelected({ contestId: 'contest-123', submissionId: 'sub-123', winnerId: 'user-456' });

      expect(logger.info).toHaveBeenCalledWith('Winner selected for contest contest-123: submission sub-123, winner user-456', 'ContestsEventHandler');
    });
  });

  describe('handlePrizeDistributed', () => {
    it('should log prize distributed event', async () => {
      await contestsEventHandler.handlePrizeDistributed({ prizeId: 'prize-123', contestId: 'contest-123', winnerId: 'user-456' });

      expect(logger.info).toHaveBeenCalledWith('Prize distributed: prize-123 for contest contest-123 to winner user-456', 'ContestsEventHandler');
    });
  });
});
