import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { ReactionsService } from './reactions.service.ts';
import type { IReactionsRepository, Reaction } from './interfaces/reactions-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockReactionsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Reaction | null>>>;
  findByUserAndStory: ReturnType<typeof vi.fn<(userId: string, storyId: string) => Promise<Reaction | null>>>;
  findReactionsByStory: ReturnType<typeof vi.fn<(storyId: string, page: number, limit: number) => Promise<{ reactions: Reaction[]; total: number }>>>;
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

describe('ReactionsService', () => {
  let reactionsService: ReactionsService;
  let reactionsRepository: MockReactionsRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    reactionsRepository = {
      findById: vi.fn<(id: string) => Promise<Reaction | null>>(),
      findByUserAndStory: vi.fn<(userId: string, storyId: string) => Promise<Reaction | null>>(),
      findReactionsByStory: vi.fn<(storyId: string, page: number, limit: number) => Promise<{ reactions: Reaction[]; total: number }>>(),
      create: vi.fn<(data: { userId: string; storyId: string; type: string }) => Promise<Reaction>>(),
      update: vi.fn<(id: string, data: { type: string }) => Promise<Reaction>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
      deleteByUserAndStory: vi.fn<(userId: string, storyId: string) => Promise<void>>(),
      countReactions: vi.fn<(storyId: string) => Promise<number>>(),
      countReactionsByType: vi.fn<(storyId: string, type: string) => Promise<number>>(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
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
        id: 'reaction-123', userId: 'user-1', storyId: 'story-1', type: 'like', createdAt: new Date(),
      });

      const result = await reactionsService.addReaction('user-1', 'story-1', 'like');

      expect(result.type).toBe('like');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.reacted', { userId: 'user-1', storyId: 'story-1', reactionType: 'like' });
    });

    it('should update existing reaction', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue({
        id: 'reaction-123', userId: 'user-1', storyId: 'story-1', type: 'like', createdAt: new Date(),
      });
      vi.mocked(reactionsRepository.update).mockResolvedValue({
        id: 'reaction-123', userId: 'user-1', storyId: 'story-1', type: 'love', createdAt: new Date(),
      });

      const result = await reactionsService.addReaction('user-1', 'story-1', 'love');

      expect(result.type).toBe('love');
      expect(reactionsRepository.update).toHaveBeenCalledWith('reaction-123', { type: 'love' });
    });

    it('should throw NotFoundException for invalid reaction type', async () => {
      await expect(reactionsService.addReaction('user-1', 'story-1', 'invalid')).rejects.toThrow('Invalid reaction type');
    });
  });

  describe('removeReaction', () => {
    it('should remove reaction successfully', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue({
        id: 'reaction-123', userId: 'user-1', storyId: 'story-1', type: 'like', createdAt: new Date(),
      });

      await reactionsService.removeReaction('user-1', 'story-1');

      expect(reactionsRepository.deleteByUserAndStory).toHaveBeenCalledWith('user-1', 'story-1');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.reaction.removed', { userId: 'user-1', storyId: 'story-1' });
    });

    it('should throw NotFoundException when reaction not found', async () => {
      vi.mocked(reactionsRepository.findByUserAndStory).mockResolvedValue(null);

      await expect(reactionsService.removeReaction('user-1', 'story-1')).rejects.toThrow('Reaction not found');
    });
  });

  describe('getReactionCounts', () => {
    it('should return reaction counts', async () => {
      vi.mocked(reactionsRepository.countReactionsByType).mockResolvedValue(5);

      const result = await reactionsService.getReactionCounts('story-1');

      expect(result).toHaveProperty('like');
      expect(result.like).toBe(5);
    });
  });
});
