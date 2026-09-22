import { describe, it, expect, vi } from 'vitest';
import { UserRestrictionsService } from './user-restrictions.service.js';

describe('UserRestrictionsService', () => {
  it('should be defined', () => {
    const service = new UserRestrictionsService();
    expect(service).toBeDefined();
  });
});
