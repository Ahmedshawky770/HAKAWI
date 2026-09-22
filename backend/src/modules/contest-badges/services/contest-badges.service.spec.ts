import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContestBadgesService } from './contest-badges.service.js';
import type { ContestBadgesRepository } from '../repositories/contest-badges.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

type MockContestBadgesRepository = {
  findByContestId: ReturnType<typeof vi.fn>;
  findByWinnerId: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockContestBadge = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'badge-123',
  contestId: 'contest-123',
  winnerId: 'user-123',
  submissionId: 'submission-123',
  badgeType: 'winner',
  prize: 'First place',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ContestBadgesService', () => {
  let contestBadgesService: ContestBadgesService;
  let contestBadgesRepository: MockContestBadgesRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    contestBadgesRepository = {
      findByContestId: vi.fn(),
      findByWinnerId: vi.fn(),
      create: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    contestBadgesService = new ContestBadgesService(
      contestBadgesRepository as unknown as ContestBadgesRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('findByContestId', () => {
    it('should return badges by contest', async () => {
      const badges = [createMockContestBadge()];
      vi.mocked(contestBadgesRepository.findByContestId).mockResolvedValue(badges as any);

      const result = await contestBadgesService.findByContestId('contest-123');

      expect(result).toEqual(badges);
    });
  });

  describe('findByWinnerId', () => {
    it('should return badges by winner', async () => {
      const badges = [createMockContestBadge()];
      vi.mocked(contestBadgesRepository.findByWinnerId).mockResolvedValue(badges as any);

      const result = await contestBadgesService.findByWinnerId('user-123');

      expect(result).toEqual(badges);
    });
  });

  describe('award', () => {
    it('should award badge and emit event', async () => {
      const badge = createMockContestBadge();
      vi.mocked(contestBadgesRepository.create).mockResolvedValue(badge as any);

      const result = await contestBadgesService.award({
        contestId: 'contest-123',
        winnerId: 'user-123',
        submissionId: 'submission-123',
        badgeType: 'winner',
        prize: 'First place',
      } as any);

      expect(result).toEqual(badge);
      expect(eventEmitter.emit).toHaveBeenCalledWith('contest.winner_selected', {
        contestId: 'contest-123',
        winnerId: 'user-123',
        submissionId: 'contest-123',
        prize: 'winner',
      });
    });
  });
});
