import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactionsController } from './controllers/reactions.controller';
import { ReactionsService } from './reactions.service';
import type { Reaction } from './types';

type MockReactionsService = Partial<ReactionsService>;

describe('ReactionsController', () => {
  let reactionsService: MockReactionsService;
  let controller: ReactionsController;

  beforeEach(() => {
    reactionsService = {
      addReaction: vi.fn(),
      removeReaction: vi.fn(),
      getReactions: vi.fn(),
      getReactionCounts: vi.fn(),
      getUserReaction: vi.fn(),
    };

    controller = new ReactionsController(reactionsService as ReactionsService);
  });

  describe('addReaction', () => {
    it('should add a reaction to a story', async () => {
      vi.mocked(reactionsService.addReaction).mockResolvedValue({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: new Date(),
      } as Reaction);

      const result = await controller.addReaction(
        'story-1',
        { type: 'like' },
        { user: { sub: 'user-1' } } as any,
      );

      expect(result).toEqual({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: expect.any(Date),
      });
      expect(reactionsService.addReaction).toHaveBeenCalledWith('user-1', 'story-1', 'like');
    });
  });

  describe('removeReaction', () => {
    it('should remove a reaction from a story', async () => {
      vi.mocked(reactionsService.removeReaction).mockResolvedValue(undefined as void);

      const result = await controller.removeReaction(
        'story-1',
        { user: { sub: 'user-1' } } as any,
      );

      expect(result).toEqual({ message: 'Reaction removed' });
      expect(reactionsService.removeReaction).toHaveBeenCalledWith('user-1', 'story-1');
    });
  });

  describe('getReactions', () => {
    it('should return reactions for a story with default pagination', async () => {
      vi.mocked(reactionsService.getReactions).mockResolvedValue({
        reactions: [],
        total: 0,
      });

      const result = await controller.getReactions('story-1');

      expect(result).toEqual({ reactions: [], total: 0 });
      expect(reactionsService.getReactions).toHaveBeenCalledWith('story-1', 1, 20);
    });

    it('should return reactions for a story with custom pagination', async () => {
      vi.mocked(reactionsService.getReactions).mockResolvedValue({
        reactions: [],
        total: 0,
      });

      const result = await controller.getReactions('story-1', '2', '10');

      expect(result).toEqual({ reactions: [], total: 0 });
      expect(reactionsService.getReactions).toHaveBeenCalledWith('story-1', 2, 10);
    });
  });

  describe('getReactionCounts', () => {
    it('should return reaction counts for a story', async () => {
      vi.mocked(reactionsService.getReactionCounts).mockResolvedValue({
        like: 5,
        love: 3,
        wow: 1,
        sad: 0,
        angry: 0,
        haunted: 2,
      });

      const result = await controller.getReactionCounts('story-1');

      expect(result).toEqual({
        like: 5,
        love: 3,
        wow: 1,
        sad: 0,
        angry: 0,
        haunted: 2,
      });
      expect(reactionsService.getReactionCounts).toHaveBeenCalledWith('story-1');
    });
  });

  describe('getUserReaction', () => {
    it('should return the current user reaction for a story', async () => {
      vi.mocked(reactionsService.getUserReaction).mockResolvedValue({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: new Date(),
      } as Reaction);

      const result = await controller.getUserReaction(
        'story-1',
        { user: { sub: 'user-1' } } as any,
      );

      expect(result).toEqual({
        id: 'reaction-123',
        userId: 'user-1',
        storyId: 'story-1',
        type: 'like',
        createdAt: expect.any(Date),
      });
      expect(reactionsService.getUserReaction).toHaveBeenCalledWith('user-1', 'story-1');
    });

    it('should return null when user has no reaction', async () => {
      vi.mocked(reactionsService.getUserReaction).mockResolvedValue(null);

      const result = await controller.getUserReaction(
        'story-1',
        { user: { sub: 'user-1' } } as any,
      );

      expect(result).toBeNull();
      expect(reactionsService.getUserReaction).toHaveBeenCalledWith('user-1', 'story-1');
    });
  });
});
