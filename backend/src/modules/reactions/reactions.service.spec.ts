import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { ReactionsService } from './reactions.service.ts';
import type { Reaction } from './interfaces/reactions-repository.interface.ts';
import { VALID_REACTION_TYPES } from './types.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockReactionsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Reaction | null>>>;
  findByUserAndStory: ReturnType<typeof vi.fn<(userId: string, storyId: string) => Promise<Reaction | null>>>;
  findReactionsByStory: ReturnType<
    typeof vi.fn<(storyId: string, page: number, limit: number) => Promise<{ reactions: Reaction[]; total: number }>>
  >;
  create: ReturnType<typeof vi.fn<(data: { userId: string; storyId: string; type: string }) => Promise<Reaction>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: { type: string }) => Promise<Reaction>>>;
  delete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  deleteByUserAndStory: ReturnType<typeof vi.fn<(userId: string, storyId: string) => Promise<void>>>;
  countReactions: ReturnType<typeof vi.fn<(storyId: string) => Promise<number>>>;
  countReactionsByType: ReturnType<typeof vi.fn<(storyId: string, type: string) => Promise<number>>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventValidatorService = { emit: ReturnType<typeof vi.fn>; validateEvent: ReturnType<typeof vi.fn> };

const REACTION: Reaction = {
  id: 'reaction-123',
  userId: 'user-1',
  storyId: 'story-1',
  type: 'like',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ReactionsService', () => {
  let reactionsService: ReactionsService;
  let reactionsRepository: MockReactionsRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    reactionsRepository = {
      findById: vi.fn<(id: string) => Promise<Reaction | null>>(),
      findByUserAndStory: vi.fn<(userId: string, storyId: string) => Promise<Reaction | null>>(),
      findReactionsByStory:
        vi.fn<(storyId: string, page: number, limit: number) => Promise<{ reactions: Reaction[]; total: number }>>(),
      create: vi.fn<(data: { userId: string; storyId: string; type: string }) => Promise<Reaction>>(),
      update: vi.fn<(id: string, data: { type: string }) => Promise<Reaction>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
      deleteByUserAndStory: vi.fn<(userId: string, storyId: string) => Promise<void>>(),
      countReactions: vi.fn<(storyId: string) => Promise<number>>(),
      countReactionsByType: vi.fn<(storyId: string, type: string) => Promise<number>>(),
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

    reactionsService = new ReactionsService(
      reactionsRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('addReaction', () => {
    it('should create a new reaction', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);
      vi.mocked(reactionsRepository.create).mockResolvedValue({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: new Date(),
      });

      const result = await reactionsService.addReaction('user-1', 'story-1', 'like');

      expect(result.type).toBe('like');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.reacted', {
        userId: 'user-1',
        storyId: 'story-1',
        reactionType: 'like',
      });
    });

    it('should update existing reaction', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: new Date(),
      });
      vi.mocked(reactionsRepository.update).mockResolvedValue({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'love',
        createdAt: new Date(),
      });

      const result = await reactionsService.addReaction('user-1', 'story-1', 'love');

      expect(result.type).toBe('love');
      expect(reactionsRepository.update).toHaveBeenCalledWith('reaction-123', { type: 'love' });
    });

    it('should throw NotFoundException for invalid reaction type', async () => {
      await expect(reactionsService.addReaction('user-1', 'story-1', 'invalid')).rejects.toThrow(
        'Invalid reaction type',
      );
    });

    it.each(VALID_REACTION_TYPES)('should accept the %s reaction type', async (type) => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);
      vi.mocked(reactionsRepository.create).mockResolvedValue({ ...REACTION, type });

      const result = await reactionsService.addReaction('user-1', 'story-1', type);

      expect(result.type).toBe(type);
      expect(reactionsRepository.create).toHaveBeenCalledWith({ userId: 'user-1', storyId: 'story-1', type });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.reacted', {
        userId: 'user-1',
        storyId: 'story-1',
        reactionType: type,
      });
    });

    it.each(['LIKE', 'Love', 'like ', '', 'fire', 'loveu'])(
      'should reject the invalid reaction type %j without touching the database',
      async (type) => {
        await expect(reactionsService.addReaction('user-1', 'story-1', type)).rejects.toThrow(NotFoundException);

        expect(reactionsRepository.findByUserAndStory).not.toHaveBeenCalled();
        expect(reactionsRepository.create).not.toHaveBeenCalled();
        expect(reactionsRepository.update).not.toHaveBeenCalled();
      },
    );

    it('should not create a second row when the user already reacted', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);
      vi.mocked(reactionsRepository.update).mockResolvedValue({ ...REACTION, type: 'wow' });

      await reactionsService.addReaction('user-1', 'story-1', 'wow');

      expect(reactionsRepository.create).not.toHaveBeenCalled();
      expect(reactionsRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should still route through update when the type is unchanged', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);
      vi.mocked(reactionsRepository.update).mockResolvedValue(REACTION);

      const result = await reactionsService.addReaction('user-1', 'story-1', 'like');

      expect(reactionsRepository.update).toHaveBeenCalledWith('reaction-123', { type: 'like' });
      expect(result).toEqual(REACTION);
    });

    it('should not announce a reaction change as a new reaction', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);
      vi.mocked(reactionsRepository.update).mockResolvedValue({ ...REACTION, type: 'sad' });

      await reactionsService.addReaction('user-1', 'story-1', 'sad');

      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });

    it('should look the existing reaction up for that user and story', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);
      vi.mocked(reactionsRepository.create).mockResolvedValue(REACTION);

      await reactionsService.addReaction('user-7', 'story-9', 'haunted');

      expect(reactionsRepository.findByUserAndStory).toHaveBeenCalledWith('user-7', 'story-9');
    });

    it('should let a create failure propagate without announcing the reaction', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);
      vi.mocked(reactionsRepository.create).mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      await expect(reactionsService.addReaction('user-1', 'story-1', 'like')).rejects.toThrow(
        'duplicate key value violates unique constraint',
      );
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });
  });

  describe('removeReaction', () => {
    it('should remove reaction successfully', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: new Date(),
      });

      await reactionsService.removeReaction('user-1', 'story-1');

      expect(reactionsRepository.deleteByUserAndStory).toHaveBeenCalledWith('user-1', 'story-1');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.reaction.removed', {
        userId: 'user-1',
        storyId: 'story-1',
      });
    });

    it('should throw NotFoundException when reaction not found', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);

      await expect(reactionsService.removeReaction('user-1', 'story-1')).rejects.toThrow('Reaction not found');
    });

    it('should refuse to remove a reaction and announce nothing when none exists', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);

      await expect(reactionsService.removeReaction('user-1', 'story-1')).rejects.toThrow(NotFoundException);

      expect(reactionsRepository.deleteByUserAndStory).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });

    it('should only remove the caller own reaction', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);

      await reactionsService.removeReaction('attacker-999', 'story-1');

      expect(reactionsRepository.findByUserAndStory).toHaveBeenCalledWith('attacker-999', 'story-1');
    });

    it('should not remove by id, so another user reaction cannot be deleted', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);

      await reactionsService.removeReaction('user-1', 'story-1');

      expect(reactionsRepository.delete).not.toHaveBeenCalled();
    });

    it('should let a delete failure propagate without announcing the removal', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);
      vi.mocked(reactionsRepository.deleteByUserAndStory).mockRejectedValue(new Error('connection reset'));

      await expect(reactionsService.removeReaction('user-1', 'story-1')).rejects.toThrow('connection reset');
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });
  });

  describe('getReactions', () => {
    it('should return the page and total unchanged', async () => {
      vi.mocked(reactionsRepository.findReactionsByStory).mockResolvedValue({ reactions: [REACTION], total: 1 });

      await expect(reactionsService.getReactions('story-1')).resolves.toEqual({
        reactions: [REACTION],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('should default to the first page of twenty', async () => {
      vi.mocked(reactionsRepository.findReactionsByStory).mockResolvedValue({ reactions: [], total: 0 });

      await reactionsService.getReactions('story-1');

      expect(reactionsRepository.findReactionsByStory).toHaveBeenCalledWith('story-1', 1, 20);
    });

    it('should forward an explicit page and limit', async () => {
      vi.mocked(reactionsRepository.findReactionsByStory).mockResolvedValue({ reactions: [], total: 0 });

      await reactionsService.getReactions('story-1', 3, 5);

      expect(reactionsRepository.findReactionsByStory).toHaveBeenCalledWith('story-1', 3, 5);
    });

    it('should return an empty page for a story nobody reacted to', async () => {
      vi.mocked(reactionsRepository.findReactionsByStory).mockResolvedValue({ reactions: [], total: 0 });

      await expect(reactionsService.getReactions('story-1')).resolves.toEqual({
        reactions: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it('should report the page it actually read instead of dropping it', async () => {
      vi.mocked(reactionsRepository.findReactionsByStory).mockResolvedValue({ reactions: [REACTION], total: 41 });

      await expect(reactionsService.getReactions('story-1', 2, 10)).resolves.toEqual({
        reactions: [REACTION],
        total: 41,
        page: 2,
        limit: 10,
      });
      expect(reactionsRepository.findReactionsByStory).toHaveBeenCalledWith('story-1', 2, 10);
    });
  });

  describe('getReactionCounts', () => {
    it('should return reaction counts', async () => {
      vi.mocked(reactionsRepository.countReactionsByType).mockResolvedValue(5);

      const result = await reactionsService.getReactionCounts('story-1');

      expect(result).toHaveProperty('like');
      expect(result.like).toBe(5);
    });

    it('should ask for every one of the six supported types exactly once', async () => {
      vi.mocked(reactionsRepository.countReactionsByType).mockResolvedValue(0);

      await reactionsService.getReactionCounts('story-1');

      expect(reactionsRepository.countReactionsByType).toHaveBeenCalledTimes(6);
      expect(VALID_REACTION_TYPES).toEqual(['like', 'love', 'wow', 'sad', 'angry', 'haunted']);
      for (const type of VALID_REACTION_TYPES) {
        expect(reactionsRepository.countReactionsByType).toHaveBeenCalledWith('story-1', type);
      }
    });

    it('should return a zero for every type when nobody reacted', async () => {
      vi.mocked(reactionsRepository.countReactionsByType).mockResolvedValue(0);

      await expect(reactionsService.getReactionCounts('story-1')).resolves.toEqual({
        like: 0,
        love: 0,
        wow: 0,
        sad: 0,
        angry: 0,
        haunted: 0,
      });
    });

    it('should keep each type count separate', async () => {
      vi.mocked(reactionsRepository.countReactionsByType).mockImplementation(async (_storyId: string, type: string) =>
        type === 'love' ? 12 : 1,
      );

      const result = await reactionsService.getReactionCounts('story-1');

      expect(result.love).toBe(12);
      expect(result.like).toBe(1);
      expect(result.haunted).toBe(1);
    });

    it('should not fall back to the untyped total count', async () => {
      vi.mocked(reactionsRepository.countReactionsByType).mockResolvedValue(0);

      await reactionsService.getReactionCounts('story-1');

      expect(reactionsRepository.countReactions).not.toHaveBeenCalled();
    });
  });

  describe('getUserReaction', () => {
    it('should return the user reaction when one exists', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(REACTION);

      await expect(reactionsService.getUserReaction('user-1', 'story-1')).resolves.toEqual(REACTION);
      expect(reactionsRepository.findByUserAndStory).toHaveBeenCalledWith('user-1', 'story-1');
    });

    it('should return null when the user has not reacted', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);

      await expect(reactionsService.getUserReaction('user-1', 'story-1')).resolves.toBeNull();
    });
  });
});
