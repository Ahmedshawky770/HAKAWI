import { describe, it, expect, vi } from 'vitest';
import { ContestsService } from './contests.service.js';

describe('ContestsService', () => {
  it('should be defined', () => {
    const service = new ContestsService();
    expect(service).toBeDefined();
  });
});
