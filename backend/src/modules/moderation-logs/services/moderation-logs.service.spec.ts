import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModerationLogsService } from './moderation-logs.service.js';
import type { ModerationLogsRepository } from '../repositories/moderation-logs.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

type MockModerationLogsRepository = Partial<ModerationLogsRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockModerationLog = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'log-123',
  moderatorId: 'user-1',
  targetId: 'user-2',
  targetType: 'user',
  action: 'warn',
  reason: 'Violation of terms',
  createdAt: new Date(),
  ...overrides,
});

describe('ModerationLogsService', () => {
  let moderationLogsService: ModerationLogsService;
  let moderationLogsRepository: MockModerationLogsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    moderationLogsRepository = {
      findById: vi.fn(),
      findByModeratorId: vi.fn(),
      findByTargetId: vi.fn(),
      findRecent: vi.fn(),
      create: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    moderationLogsService = new ModerationLogsService(
      moderationLogsRepository as ModerationLogsRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return log when found', async () => {
      const log = createMockModerationLog();
      vi.mocked(moderationLogsRepository.findById).mockResolvedValue(log as any);

      const result = await moderationLogsService.findById('log-123');

      expect(result).toEqual(log);
    });

    it('should throw NotFoundException when log not found', async () => {
      vi.mocked(moderationLogsRepository.findById).mockResolvedValue(null);

      await expect(moderationLogsService.findById('log-123')).rejects.toThrow('Moderation log not found');
    });
  });

  describe('findByModeratorId', () => {
    it('should return logs by moderator', async () => {
      const logs = [createMockModerationLog()];
      vi.mocked(moderationLogsRepository.findByModeratorId).mockResolvedValue(logs as any);

      const result = await moderationLogsService.findByModeratorId('user-1');

      expect(result).toEqual(logs);
    });
  });

  describe('findByTargetId', () => {
    it('should return logs by target', async () => {
      const logs = [createMockModerationLog()];
      vi.mocked(moderationLogsRepository.findByTargetId).mockResolvedValue(logs as any);

      const result = await moderationLogsService.findByTargetId('user-2', 'user');

      expect(result).toEqual(logs);
    });
  });

  describe('findRecent', () => {
    it('should return recent logs', async () => {
      const logs = [createMockModerationLog()];
      vi.mocked(moderationLogsRepository.findRecent).mockResolvedValue(logs as any);

      const result = await moderationLogsService.findRecent(10);

      expect(result).toEqual(logs);
    });
  });

  describe('create', () => {
    it('should create log and emit event', async () => {
      const log = createMockModerationLog();
      vi.mocked(moderationLogsRepository.create).mockResolvedValue(log as any);

      const result = await moderationLogsService.create({
        moderatorId: 'user-1',
        targetId: 'user-2',
        targetType: 'user',
        action: 'warn',
        reason: 'Violation of terms',
      } as any);

      expect(result).toEqual(log);
      expect(eventEmitter.emit).toHaveBeenCalledWith('content.moderation_action', {
        reportId: '',
        moderatorId: 'user-1',
        action: 'warn',
        targetId: 'user-2',
        targetType: 'user',
        reason: 'Violation of terms',
      });
    });
  });
});
