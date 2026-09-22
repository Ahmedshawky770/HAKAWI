import { describe, it, expect, vi } from 'vitest';
import { UserLibrariesService } from './user-libraries.service.js';

describe('UserLibrariesService', () => {
  it('should be defined', () => {
    const service = new UserLibrariesService();
    expect(service).toBeDefined();
  });
});
