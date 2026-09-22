import { describe, it, expect, vi } from 'vitest';
import { StoryCategoriesService } from './story-categories.service.js';

describe('StoryCategoriesService', () => {
  it('should be defined', () => {
    const service = new StoryCategoriesService();
    expect(service).toBeDefined();
  });
});
