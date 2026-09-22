import { describe, it, expect, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';

describe('TransactionsService', () => {
  it('should be defined', () => {
    const service = new TransactionsService();
    expect(service).toBeDefined();
  });
});
