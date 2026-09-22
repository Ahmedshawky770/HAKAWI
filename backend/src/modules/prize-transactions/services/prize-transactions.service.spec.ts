import { describe, it, expect, vi } from 'vitest';
import { PrizeTransactionsService } from './prize-transactions.service.js';

describe('PrizeTransactionsService', () => {
  it('should be defined', () => {
    const service = new PrizeTransactionsService();
    expect(service).toBeDefined();
  });
});
