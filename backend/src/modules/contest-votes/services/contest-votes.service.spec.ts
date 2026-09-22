import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContestVotesService } from './contest-votes.service.js';
import type { ContestVotesRepository } from '../repositories/contest-votes.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException } from '@nestjs/common';

type MockContestVotesRepository = {
  findByContestAndUser: ReturnType<typeof vi.fn>;
  findBySubmissionId: ReturnType<typeof vi.fn>;
  countBySubmission: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockContestVote = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'vote-123',
  contestId: 'contest-123',
  submissionId: 'submission-123',
  userId: 'user-123',
  score: 5,
  comment: 'Great submission',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ContestVotesService', () => {
  let contestVotesService: ContestVotesService;
  let contestVotesRepository: MockContestVotesRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    contestVotesRepository = {
      findByContestAndUser: vi.fn(),
      findBySubmissionId: vi.fn(),
      countBySubmission: vi.fn(),
      create: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    contestVotesService = new ContestVotesService(
      contestVotesRepository as unknown as ContestVotesRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('findByContestAndUser', () => {
    it('should return vote by contest and user', async () => {
      const vote = createMockContestVote();
      vi.mocked(contestVotesRepository.findByContestAndUser).mockResolvedValue(vote as any);

      const result = await contestVotesService.findByContestAndUser('contest-123', 'user-123');

      expect(result).toEqual(vote);
    });
  });

  describe('findBySubmissionId', () => {
    it('should return votes by submission', async () => {
      const votes = [createMockContestVote()];
      vi.mocked(contestVotesRepository.findBySubmissionId).mockResolvedValue(votes as any);

      const result = await contestVotesService.findBySubmissionId('submission-123');

      expect(result).toEqual(votes);
    });
  });

  describe('countBySubmission', () => {
    it('should return vote count by submission', async () => {
      vi.mocked(contestVotesRepository.countBySubmission).mockResolvedValue(10);

      const result = await contestVotesService.countBySubmission('submission-123');

      expect(result).toBe(10);
    });
  });

  describe('vote', () => {
    it('should create vote and emit event', async () => {
      const vote = createMockContestVote();
      vi.mocked(contestVotesRepository.findByContestAndUser).mockResolvedValue(null);
      vi.mocked(contestVotesRepository.create).mockResolvedValue(vote as any);

      const result = await contestVotesService.vote('user-123', {
        contestId: 'contest-123',
        submissionId: 'submission-123',
        score: 5,
        comment: 'Great submission',
      } as any);

      expect(result).toEqual(vote);
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.vote_cast', {
        voteId: 'vote-123',
        contestId: 'contest-123',
        userId: 'user-123',
        submissionId: 'submission-123',
      });
    });

    it('should throw ConflictException when user already voted', async () => {
      vi.mocked(contestVotesRepository.findByContestAndUser).mockResolvedValue(createMockContestVote() as any);

      await expect(contestVotesService.vote('user-123', {
        contestId: 'contest-123',
        submissionId: 'submission-123',
        score: 5,
        comment: 'Great submission',
      } as any)).rejects.toThrow('You have already voted in this contest');
    });
  });
});
