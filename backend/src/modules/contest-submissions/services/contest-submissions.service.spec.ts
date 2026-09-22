import { describe, it, expect, vi } from 'vitest';
import { ContestSubmissionsService } from './contest-submissions.service.js';

describe('ContestSubmissionsService', () => {
  it('should be defined', () => {
    const service = new ContestSubmissionsService();
    expect(service).toBeDefined();
  });
});
