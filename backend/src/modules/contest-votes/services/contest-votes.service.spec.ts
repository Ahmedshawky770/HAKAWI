import { describe, it, expect, vi } from 'vitest';
import { ContestVotesService } from './contest-votes.service.js';

describe('ContestVotesService', () => {
  it('should be defined', () => {
    const service = new ContestVotesService();
    expect(service).toBeDefined();
  });
});
