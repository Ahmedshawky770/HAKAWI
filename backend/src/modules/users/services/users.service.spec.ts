import { describe, it, expect, vi } from 'vitest';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  it('should be defined', () => {
    const service = new UsersService();
    expect(service).toBeDefined();
  });
});
