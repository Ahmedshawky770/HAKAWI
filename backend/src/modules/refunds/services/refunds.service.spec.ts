import { describe, it, expect, vi } from 'vitest';
import { RefundsService } from './refunds.service.js';

describe('RefundsService', () => {
  it('should be defined', () => {
    const service = new RefundsService();
    expect(service).toBeDefined();
  });
});
