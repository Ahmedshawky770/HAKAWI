import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryViewsService } from './story-views.service.js';
import type { StoryViewsRepository } from '../repositories/story-views.repository.js';

type MockStoryViewsRepository = Partial<StoryViewsRepository>;

const createMockStoryView = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'view-123',
  storyId: 'story-123',
  viewerId: 'user-123',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date(),
  ...overrides,
});

describe('StoryViewsService', () => {
  let storyViewsService: StoryViewsService;
  let storyViewsRepository: MockStoryViewsRepository;

  beforeEach(() => {
    storyViewsRepository = {
      create: vi.fn(),
      findByStoryId: vi.fn(),
      findByViewerId: vi.fn(),
      countByStoryId: vi.fn(),
    };

    storyViewsService = new StoryViewsService(
      storyViewsRepository as StoryViewsRepository,
    );
  });

  describe('create', () => {
    it('should create story view', async () => {
      const view = createMockStoryView();
      vi.mocked(storyViewsRepository.create).mockResolvedValue(view as any);

      const result = await storyViewsService.create({
        storyId: 'story-123',
        viewerId: 'user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result).toEqual(view);
    });
  });

  describe('findByStoryId', () => {
    it('should return views by story', async () => {
      const views = [createMockStoryView()];
      vi.mocked(storyViewsRepository.findByStoryId).mockResolvedValue(views as any);

      const result = await storyViewsService.findByStoryId('story-123');

      expect(result).toEqual(views);
    });
  });

  describe('findByViewerId', () => {
    it('should return views by viewer', async () => {
      const views = [createMockStoryView()];
      vi.mocked(storyViewsRepository.findByViewerId).mockResolvedValue(views as any);

      const result = await storyViewsService.findByViewerId('user-123');

      expect(result).toEqual(views);
    });
  });

  describe('countByStoryId', () => {
    it('should return view count by story', async () => {
      vi.mocked(storyViewsRepository.countByStoryId).mockResolvedValue(100);

      const result = await storyViewsService.countByStoryId('story-123');

      expect(result).toBe(100);
    });
  });
});
