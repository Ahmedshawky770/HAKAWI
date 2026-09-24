import { describe, it, expect, beforeEach, vi } from 'vitest';

import { SanityService } from './sanity.service.ts';
import type { SanityStoryDocument } from './sanity.types.ts';
import type { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.js';

describe('SanityService', () => {
  let sanityService: SanityService;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockCircuitBreaker: Partial<CircuitBreakerService>;
  let mockClient: {
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    process.env.SANITY_PROJECT_ID = 'test-project';
    process.env.SANITY_DATASET = 'production';
    process.env.SANITY_API_VERSION = '2024-01-01';

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    mockCircuitBreaker = {
      execute: vi.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    };

    mockClient = {
      create: vi.fn(),
      patch: vi.fn(() => ({ set: vi.fn(() => ({ commit: vi.fn() })) })),
      delete: vi.fn(),
      fetch: vi.fn(),
    };

    sanityService = new SanityService(mockLogger as any, mockCircuitBreaker as any, mockClient as any);
  });

  describe('syncStoryToSanity', () => {
    it('should create a new story document in Sanity', async () => {
      mockClient.fetch.mockResolvedValue(null);
      mockClient.create.mockResolvedValue({ _id: 'story-story-123', _type: 'story' });

      const story = { id: 'story-123', title: 'Test', slug: 'test', status: 'published', authorId: 'author-1', hakawiId: 'story-123' } as SanityStoryDocument;
      const result = await sanityService.syncStoryToSanity(story);
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('story-story-123');
    });
  });

  describe('deleteStoryFromSanity', () => {
    it('should delete a story document from Sanity', async () => {
      mockClient.delete.mockResolvedValue(undefined);
      const result = await sanityService.deleteStoryFromSanity('story-123');
      expect(result.success).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('should return true when project ID is configured', () => {
      expect(sanityService.isEnabled()).toBe(true);
    });
  });
});
