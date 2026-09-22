import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContestSubmissionsService, SUBMISSION_STATUS } from './contest-submissions.service.js';
import type { ContestSubmissionsRepository } from '../repositories/contest-submissions.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException } from '@nestjs/common';

type MockContestSubmissionsRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByContestId: ReturnType<typeof vi.fn>;
  findByAuthorId: ReturnType<typeof vi.fn>;
  findByContestAndAuthor: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  countByContest: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockContestSubmission = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'submission-123',
  contestId: 'contest-123',
  authorId: 'user-123',
  title: 'Test Submission',
  content: 'Test content',
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ContestSubmissionsService', () => {
  let contestSubmissionsService: ContestSubmissionsService;
  let contestSubmissionsRepository: MockContestSubmissionsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    contestSubmissionsRepository = {
      findById: vi.fn(),
      findByContestId: vi.fn(),
      findByAuthorId: vi.fn(),
      findByContestAndAuthor: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      countByContest: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    contestSubmissionsService = new ContestSubmissionsService(
      contestSubmissionsRepository as unknown as ContestSubmissionsRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return submission when found', async () => {
      const submission = createMockContestSubmission();
      vi.mocked(contestSubmissionsRepository.findById).mockResolvedValue(submission as any);

      const result = await contestSubmissionsService.findById('submission-123');

      expect(result).toEqual(submission);
    });

    it('should throw NotFoundException when submission not found', async () => {
      vi.mocked(contestSubmissionsRepository.findById).mockResolvedValue(null);

      await expect(contestSubmissionsService.findById('submission-123')).rejects.toThrow('Contest submission not found');
    });
  });

  describe('findByContestId', () => {
    it('should return submissions by contest', async () => {
      const submissions = [createMockContestSubmission()];
      vi.mocked(contestSubmissionsRepository.findByContestId).mockResolvedValue(submissions as any);

      const result = await contestSubmissionsService.findByContestId('contest-123');

      expect(result).toEqual(submissions);
    });
  });

  describe('findByAuthorId', () => {
    it('should return submissions by author', async () => {
      const submissions = [createMockContestSubmission()];
      vi.mocked(contestSubmissionsRepository.findByAuthorId).mockResolvedValue(submissions as any);

      const result = await contestSubmissionsService.findByAuthorId('user-123');

      expect(result).toEqual(submissions);
    });
  });

  describe('create', () => {
    it('should create submission and emit event', async () => {
      const submission = createMockContestSubmission();
      vi.mocked(contestSubmissionsRepository.findByContestAndAuthor).mockResolvedValue(null);
      vi.mocked(contestSubmissionsRepository.create).mockResolvedValue(submission as any);

      const result = await contestSubmissionsService.create('user-123', {
        contestId: 'contest-123',
        title: 'Test Submission',
        content: 'Test content',
        storyId: 'story-123',
      } as any);

      expect(result).toEqual(submission);
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.submission_created', {
        submissionId: 'submission-123',
        contestId: 'contest-123',
        userId: 'user-123',
        storyId: 'story-123',
      });
    });

    it('should throw ConflictException when user already submitted', async () => {
      vi.mocked(contestSubmissionsRepository.findByContestAndAuthor).mockResolvedValue(createMockContestSubmission() as any);

      await expect(contestSubmissionsService.create('user-123', {
        contestId: 'contest-123',
        title: 'Test Submission',
        content: 'Test content',
        storyId: 'story-123',
      } as any)).rejects.toThrow('You have already submitted to this contest');
    });
  });

  describe('update', () => {
    it('should update submission', async () => {
      const updatedSubmission = createMockContestSubmission({ status: SUBMISSION_STATUS.APPROVED });
      vi.mocked(contestSubmissionsRepository.findById).mockResolvedValue(createMockContestSubmission() as any);
      vi.mocked(contestSubmissionsRepository.update).mockResolvedValue(updatedSubmission as any);

      const result = await contestSubmissionsService.update('submission-123', SUBMISSION_STATUS.APPROVED, 'Good', 1);

      expect(result).toEqual(updatedSubmission);
    });
  });
});
