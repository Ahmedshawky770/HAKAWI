import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import type { Follow } from './interfaces/follows-repository.interface.ts';
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

const FOLLOW: Follow = {
  id: 'follow-123',
  followerId: 'user-1',
  followingId: 'user-2',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

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
      expect(eventValidatorService.emit).toHaveBeenCalledWith('user.followed', {
        followerId: 'user-1',
        followingId: 'user-2',
      });
    });

    it('should return the row the repository created', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);
      vi.mocked(followsRepository.create).mockResolvedValue(FOLLOW);

      await expect(followsService.follow('user-1', 'user-2')).resolves.toEqual(FOLLOW);
    });

    it('should throw BadRequestException when following yourself', async () => {
      await expect(followsService.follow('user-1', 'user-1')).rejects.toThrow('Cannot follow yourself');
    });

    it('should reject a self follow before touching the database', async () => {
      await expect(followsService.follow('user-1', 'user-1')).rejects.toThrow(BadRequestException);

      expect(followsRepository.findByUsers).not.toHaveBeenCalled();
      expect(followsRepository.create).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
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

    it('should surface the duplicate follow as a 409 conflict', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(FOLLOW);

      await expect(followsService.follow('user-1', 'user-2')).rejects.toThrow(ConflictException);
    });

    it('should not create a second row or emit an event for a duplicate follow', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(FOLLOW);

      await expect(followsService.follow('user-1', 'user-2')).rejects.toThrow();

      expect(followsRepository.create).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });

    it('should look the pair up in the direction it was asked for', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);
      vi.mocked(followsRepository.create).mockResolvedValue({ ...FOLLOW, followerId: 'user-2', followingId: 'user-1' });

      await followsService.follow('user-2', 'user-1');

      expect(followsRepository.findByUsers).toHaveBeenCalledWith('user-2', 'user-1');
    });

    it('should let a create failure propagate without emitting an event', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);
      vi.mocked(followsRepository.create).mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      await expect(followsService.follow('user-1', 'user-2')).rejects.toThrow(
        'duplicate key value violates unique constraint',
      );
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
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
      expect(eventValidatorService.emit).toHaveBeenCalledWith('user.unfollowed', {
        followerId: 'user-1',
        followingId: 'user-2',
      });
    });

    it('should delete the stored row id rather than the follower pair', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue({ ...FOLLOW, id: 'follow-abc' });

      await followsService.unfollow('user-1', 'user-2');

      expect(followsRepository.delete).toHaveBeenCalledWith('follow-abc');
    });

    it('should throw NotFoundException when not following', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);

      await expect(followsService.unfollow('user-1', 'user-2')).rejects.toThrow('Not following this user');
    });

    it('should surface the missing follow as a 404', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);

      await expect(followsService.unfollow('user-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('should not delete or emit when the follow does not exist', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValue(null);

      await expect(followsService.unfollow('user-1', 'user-2')).rejects.toThrow();

      expect(followsRepository.delete).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });

    it('should be idempotent in neither direction: a second unfollow still 404s', async () => {
      vi.mocked(followsRepository.findByUsers).mockResolvedValueOnce(FOLLOW).mockResolvedValueOnce(null);

      await followsService.unfollow('user-1', 'user-2');
      await expect(followsService.unfollow('user-1', 'user-2')).rejects.toThrow(NotFoundException);
      expect(followsRepository.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFollowers', () => {
    it('should return the followers page and total unchanged', async () => {
      vi.mocked(followsRepository.findFollowers).mockResolvedValue({ follows: [FOLLOW], total: 1 });

      await expect(followsService.getFollowers('user-2')).resolves.toEqual({
        follows: [FOLLOW],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('should default to the first page of twenty', async () => {
      vi.mocked(followsRepository.findFollowers).mockResolvedValue({ follows: [], total: 0 });

      await followsService.getFollowers('user-2');

      expect(followsRepository.findFollowers).toHaveBeenCalledWith('user-2', 1, 20);
    });

    it('should forward an explicit page and limit', async () => {
      vi.mocked(followsRepository.findFollowers).mockResolvedValue({ follows: [], total: 0 });

      await followsService.getFollowers('user-2', 2, 5);

      expect(followsRepository.findFollowers).toHaveBeenCalledWith('user-2', 2, 5);
    });

    it('should return an empty page for a user with no followers', async () => {
      vi.mocked(followsRepository.findFollowers).mockResolvedValue({ follows: [], total: 0 });

      await expect(followsService.getFollowers('user-2')).resolves.toEqual({
        follows: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it('should report the page it actually read instead of dropping it', async () => {
      vi.mocked(followsRepository.findFollowers).mockResolvedValue({ follows: [], total: 57 });

      await expect(followsService.getFollowers('user-2', 3, 5)).resolves.toEqual({
        follows: [],
        total: 57,
        page: 3,
        limit: 5,
      });
    });
  });

  describe('getFollowing', () => {
    it('should return the following page and total unchanged', async () => {
      vi.mocked(followsRepository.findFollowing).mockResolvedValue({ follows: [FOLLOW], total: 1 });

      await expect(followsService.getFollowing('user-1')).resolves.toEqual({
        follows: [FOLLOW],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('should default to the first page of twenty', async () => {
      vi.mocked(followsRepository.findFollowing).mockResolvedValue({ follows: [], total: 0 });

      await followsService.getFollowing('user-1');

      expect(followsRepository.findFollowing).toHaveBeenCalledWith('user-1', 1, 20);
    });

    it('should forward an explicit page and limit', async () => {
      vi.mocked(followsRepository.findFollowing).mockResolvedValue({ follows: [], total: 0 });

      await followsService.getFollowing('user-1', 4, 5);

      expect(followsRepository.findFollowing).toHaveBeenCalledWith('user-1', 4, 5);
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

    it('should always ask the repository, because a viewer is now required', async () => {
      // The previous case asserted that the relationship lookup was SKIPPED when no viewer was given.
      // That could not happen in production: `JwtAuthGuard` is not global and the route was
      // `@Public()`, so `request.user` was never assigned, `currentUserId` was always undefined, and
      // `isFollowing` was permanently false for every caller. The optional parameter only existed to
      // permit the route that caused the bug.
      vi.mocked(followsRepository.countFollowers).mockResolvedValue(0);
      vi.mocked(followsRepository.countFollowing).mockResolvedValue(0);
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(false);

      const result = await followsService.getStats('user-2', 'viewer-9');

      expect(followsRepository.isFollowing).toHaveBeenCalledWith('viewer-9', 'user-2');
      expect(result).toEqual({ followersCount: 0, followingCount: 0, isFollowing: false });
    });

    it('should ask the repository whether the viewer follows the target', async () => {
      vi.mocked(followsRepository.countFollowers).mockResolvedValue(3);
      vi.mocked(followsRepository.countFollowing).mockResolvedValue(4);
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(false);

      const result = await followsService.getStats('user-2', 'viewer-9');

      expect(followsRepository.isFollowing).toHaveBeenCalledWith('viewer-9', 'user-2');
      expect(result.isFollowing).toBe(false);
    });

    it('should coerce a truthy non-boolean repository answer into true', async () => {
      vi.mocked(followsRepository.countFollowers).mockResolvedValue(0);
      vi.mocked(followsRepository.countFollowing).mockResolvedValue(0);
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(1 as unknown as boolean);

      const result = await followsService.getStats('user-2', 'user-1');

      expect(result.isFollowing).toBe(true);
    });

    it('should return zero counts for a user nobody follows', async () => {
      vi.mocked(followsRepository.countFollowers).mockResolvedValue(0);
      vi.mocked(followsRepository.countFollowing).mockResolvedValue(0);
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(false);

      const result = await followsService.getStats('lonely-user', 'viewer-9');

      expect(result.followersCount).toBe(0);
      expect(result.followingCount).toBe(0);
      expect(result.isFollowing).toBe(false);
    });
  });

  describe('isFollowing', () => {
    it('should delegate to the repository and return its answer', async () => {
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(true);

      await expect(followsService.isFollowing('user-1', 'user-2')).resolves.toBe(true);
      expect(followsRepository.isFollowing).toHaveBeenCalledWith('user-1', 'user-2');
    });

    it('should return false when the repository says false', async () => {
      vi.mocked(followsRepository.isFollowing).mockResolvedValue(false);

      await expect(followsService.isFollowing('user-1', 'user-2')).resolves.toBe(false);
    });
  });
});
