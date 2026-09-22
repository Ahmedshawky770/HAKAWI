import { describe, it, expect, vi } from 'vitest';
import { StoryTagsService } from './story-tags.service.js';

describe('StoryTagsService', () => {
  it('should be defined', () => {
    const service = new StoryTagsService();
    expect(service).toBeDefined();
  });
});
