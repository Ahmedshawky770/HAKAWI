import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FollowsService } from './follows.service.js';
import type { IFollowsRepository } from './interfaces/follows-repository.interface.js';
import { FOLLOWS_REPOSITORY } from './interfaces/follows-repository.interface.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockFollowsRepository = Partial<IFollowsRepository>;
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventEmitter = {
  emit: ReturnType<typeof vi.fn>;
};

describe('FollowsService', () => {
  let followsService: FollowsService;
  let followsRepository: MockFollowsRepository;
  let logger: MockWinstonLoggerService;
  let eventEmitter: MockEventEmitter;

  beforeEach(() => {
    followsRepository = {
      findByUsers: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFollowers: vi.fn(),
      findFollowing: vi.fn(),
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

    eventEmitter = { emit: vi.fn() };

    followsService = new FollowsService(
      followsRepository as unknown as IFollowsRepository,
      logger as unknown as WinstonLoggerService,
      eventEmitter as unknown as EventEmitter2,
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.followed', { followerId: 'user-1', followingId: 'user-2' });
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.unfollowed', { followerId: 'user-1', followingId: 'user-2' });
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
