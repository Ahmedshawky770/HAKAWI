import { describe, it, expect, vi } from 'vitest';
import { WithdrawalsService } from './withdrawals.service.js';

describe('WithdrawalsService', () => {
  it('should be defined', () => {
    const service = new WithdrawalsService();
    expect(service).toBeDefined();
  });
});
