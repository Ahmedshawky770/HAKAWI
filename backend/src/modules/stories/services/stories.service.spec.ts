import { describe, it, expect, vi } from 'vitest';
import { StoriesService } from './stories.service.js';

describe('StoriesService', () => {
  it('should be defined', () => {
    const service = new StoriesService();
    expect(service).toBeDefined();
  });
});
