import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import type { IFollowsRepository, Follow } from './interfaces/follows-repository.interface.ts';
import { FollowsService } from './follows.service.ts';

type MockFollowsRepository = {
  findById: Mock<(id: string) => Promise<Follow | null>>;
  findByUsers: Mock<(followerId: string, followingId: string) => Promise<Follow | null>>;
  findFollowers: Mock<(userId: string, page: number, limit: number) => Promise<{ follows: Follow[]; total: number }>>;
  findFollowing: Mock<(userId: string, page: number, limit: number) => Promise<{ follows: Follow[]; total: number }>>;
  create: Mock<(data: { followerId: string; followingId: string }) => Promise<Follow>>;
  delete: Mock<(id: string) => Promise<void>>;
  countFollowers: Mock<(userId: string) => Promise<number>>;
  countFollowing: Mock<(userId: string) => Promise<number>>;
  isFollowing: Mock<(followerId: string, followingId: string) => Promise<boolean>>;
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

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe('FollowsService', () => {
  let followsService: FollowsService;
  let followsRepository: MockFollowsRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    followsRepository = {
      findById: vi.fn(),
      findByUsers: vi.fn(),
      findFollowers: vi.fn(),
      findFollowing: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      countFollowers: vi.fn(),
      countFollowing: vi.fn(),
      isFollowing: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    followsService = new FollowsService(
      followsRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('follow', () => {
    it('should follow a user successfully', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);
      vi.mocked(followsRepository.create).mockResolvedValue({
        id: 'follow-123',
        followerId: 'user-1',
        followingId: 'user-2',
        createdAt: new Date(),
      });

      const result = await followsService.follow('user-1', 'user-2');

      expect(result).toHaveProperty('id', 'follow-123');
      expect(followsRepository.create).toHaveBeenCalledWith({ followerId: 'user-1', followingId: 'user-2' });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('user.followed', { followerId: 'user-1', followingId: 'user-2' });
    });

    it('should throw BadRequestException when following yourself', async () => {
      await expect(followsService.follow('user-1', 'user-1')).rejects.toThrow('Cannot follow yourself');
    });

    it('should throw ConflictException when already following', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue({
        id: 'follow-123',
        followerId: 'user-1',
        followingId: 'user-2',
        createdAt: new Date(),
      });

      await expect(followsService.follow('user-1', 'user-2')).rejects.toThrow('Already following this user');
    });
  });

  describe('unfollow', () => {
    it('should unfollow a user successfully', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue({
        id: 'follow-123',
        followerId: 'user-1',
        followingId: 'user-2',
        createdAt: new Date(),
      });

      await followsService.unfollow('user-1', 'user-2');

      expect(followsRepository.delete).toHaveBeenCalledWith('follow-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('user.unfollowed', { followerId: 'user-1', followingId: 'user-2' });
    });

    it('should throw NotFoundException when not following', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);

      await expect(followsService.unfollow('user-1', 'user-2')).rejects.toThrow('Not following this user');
    });
  });

  describe('getStats', () => {
    it('should return follow stats', async () => {
      vi.mocked(followsRepository.countFollowers).mockResolvedValue(100);
      vi.mocked(followsRepository.countFollowing).mockResolvedValue(50);
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(true);

      const result = await followsService.getStats('user-2', 'user-1');

      expect(result).toEqual({ followersCount: 100, followingCount: 50, isFollowing: true });
    });
  });
});
