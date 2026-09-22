import { describe, it, expect, vi } from 'vitest';
import { ContestBadgesService } from './contest-badges.service.js';

describe('ContestBadgesService', () => {
  it('should be defined', () => {
    const service = new ContestBadgesService();
    expect(service).toBeDefined();
  });
});
