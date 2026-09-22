import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContestsService, CONTEST_STATUS, PRIZE_TYPE } from './contests.service.js';
import type { ContestsRepository } from '../repositories/contests.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';

type MockContestsRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByPublisherId: ReturnType<typeof vi.fn>;
  findPublished: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockContest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'contest-123',
  publisherId: 'user-123',
  title: 'Test Contest',
  description: 'Test description',
  theme: 'Writing',
  category: 'fiction',
  participantType: 'individual',
  status: 'draft',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  submissionDeadline: new Date('2024-06-01'),
  prizeType: 'cash',
  prizeValue: 100,
  prizeDescription: 'Prize description',
  rules: 'Test rules',
  minWordCount: 1000,
  maxWordCount: 5000,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ContestsService', () => {
  let contestsService: ContestsService;
  let contestsRepository: MockContestsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    contestsRepository = {
      findById: vi.fn(),
      findByPublisherId: vi.fn(),
      findPublished: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    contestsService = new ContestsService(
      contestsRepository as unknown as ContestsRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return contest when found', async () => {
      const contest = createMockContest();
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);

      const result = await contestsService.findById('contest-123');

      expect(result).toEqual(contest);
    });

    it('should throw NotFoundException when contest not found', async () => {
      vi.mocked(contestsRepository.findById).mockResolvedValue(null);

      await expect(contestsService.findById('contest-123')).rejects.toThrow('Contest not found');
    });
  });

  describe('findByPublisherId', () => {
    it('should return contests by publisher', async () => {
      const contests = [createMockContest()];
      vi.mocked(contestsRepository.findByPublisherId).mockResolvedValue(contests as any);

      const result = await contestsService.findByPublisherId('user-123');

      expect(result).toEqual(contests);
    });
  });

  describe('findPublished', () => {
    it('should return published contests with filters', async () => {
      const contests = [createMockContest()];
      vi.mocked(contestsRepository.findPublished).mockResolvedValue(contests as any);

      const result = await contestsService.findPublished({ status: 'published' });

      expect(result).toEqual(contests);
    });
  });

  describe('create', () => {
    it('should create contest with draft status and emit event', async () => {
      const contest = createMockContest();
      vi.mocked(contestsRepository.create).mockResolvedValue(contest as any);

      const result = await contestsService.create('user-123', {
        title: 'New Contest',
        description: 'Test contest',
        theme: 'Writing',
        category: 'fiction',
        participantType: 'individual',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        submissionDeadline: '2024-06-01',
        prizeType: 'cash',
        prizeValue: 100,
      } as any);

      expect(result).toEqual(contest);
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.created', {
        contestId: 'contest-123',
        publisherId: 'user-123',
        title: 'Test Contest',
        theme: 'Writing',
      });
    });
  });

  describe('update', () => {
    it('should update contest when publisher matches', async () => {
      const contest = createMockContest({ publisherId: 'user-123' });
      const updatedContest = createMockContest({ title: 'Updated Contest' });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);
      vi.mocked(contestsRepository.update).mockResolvedValue(updatedContest as any);

      const result = await contestsService.update('contest-123', 'user-123', { title: 'Updated Contest' } as any);

      expect(result).toEqual(updatedContest);
    });

    it('should throw BadRequestException when publisher does not match', async () => {
      const contest = createMockContest({ publisherId: 'other-user' });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);

      await expect(contestsService.update('contest-123', 'user-123', { title: 'Updated' } as any))
        .rejects.toThrow('You can only update your own contests');
    });
  });

  describe('delete', () => {
    it('should delete contest when publisher matches', async () => {
      const contest = createMockContest({ publisherId: 'user-123' });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);
      vi.mocked(contestsRepository.delete).mockResolvedValue(undefined as any);

      await contestsService.delete('contest-123', 'user-123');

      expect(contestsRepository.delete).toHaveBeenCalledWith('contest-123');
    });

    it('should throw BadRequestException when publisher does not match', async () => {
      const contest = createMockContest({ publisherId: 'other-user' });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);

      await expect(contestsService.delete('contest-123', 'user-123'))
        .rejects.toThrow('You can only delete your own contests');
    });
  });

  describe('start', () => {
    it('should start published contest', async () => {
      const contest = createMockContest({ publisherId: 'user-123', status: CONTEST_STATUS.PUBLISHED });
      const startedContest = createMockContest({ status: CONTEST_STATUS.ACTIVE });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);
      vi.mocked(contestsRepository.update).mockResolvedValue(startedContest as any);

      const result = await contestsService.start('contest-123', 'user-123');

      expect(result).toEqual(startedContest);
    });

    it('should throw BadRequestException when starting another users contest', async () => {
      const contest = createMockContest({ publisherId: 'other-user', status: CONTEST_STATUS.PUBLISHED });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);

      await expect(contestsService.start('contest-123', 'user-123'))
        .rejects.toThrow('You can only start your own contests');
    });

    it('should throw BadRequestException when contest is not published', async () => {
      const contest = createMockContest({ publisherId: 'user-123', status: CONTEST_STATUS.DRAFT });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);

      await expect(contestsService.start('contest-123', 'user-123'))
        .rejects.toThrow('Only published contests can be started');
    });
  });

  describe('end', () => {
    it('should end active contest', async () => {
      const contest = createMockContest({ publisherId: 'user-123', status: CONTEST_STATUS.ACTIVE });
      const endedContest = createMockContest({ status: CONTEST_STATUS.COMPLETED });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);
      vi.mocked(contestsRepository.update).mockResolvedValue(endedContest as any);

      const result = await contestsService.end('contest-123', 'user-123');

      expect(result).toEqual(endedContest);
    });

    it('should throw BadRequestException when ending another users contest', async () => {
      const contest = createMockContest({ publisherId: 'other-user', status: CONTEST_STATUS.ACTIVE });
      vi.mocked(contestsRepository.findById).mockResolvedValue(contest as any);

      await expect(contestsService.end('contest-123', 'user-123'))
        .rejects.toThrow('You can only end your own contests');
    });
  });
});
