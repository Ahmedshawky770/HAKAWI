import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactionsService } from './reactions.service.js';
import type { IReactionsRepository } from './interfaces/reactions-repository.interface.js';
import { REACTIONS_REPOSITORY } from './interfaces/reactions-repository.interface.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockReactionsRepository = Partial<IReactionsRepository>;
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventEmitter = { emit: ReturnType<typeof vi.fn> };

describe('ReactionsService', () => {
  let reactionsService: ReactionsService;
  let reactionsRepository: MockReactionsRepository;
  let logger: MockWinstonLoggerService;
  let eventEmitter: MockEventEmitter;

  beforeEach(() => {
    reactionsRepository = {
      findByUserAndStory: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteByUserAndStory: vi.fn(),
      findReactionsByStory: vi.fn(),
      countReactionsByType: vi.fn(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() };

    reactionsService = new ReactionsService(
      reactionsRepository as unknown as IReactionsRepository,
      logger as unknown as WinstonLoggerService,
      eventEmitter as unknown as EventEmitter2,
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.reacted', { userId: 'user-1', storyId: 'story-1', reactionType: 'like' });
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('story.reaction.removed', { userId: 'user-1', storyId: 'story-1' });
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
