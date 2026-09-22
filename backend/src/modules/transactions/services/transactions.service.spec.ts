import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';
import type { TransactionsRepository } from '../repositories/transactions.repository.js';
import { NotFoundException } from '@nestjs/common';

type MockTransactionsRepository = Partial<TransactionsRepository>;

const createMockTransaction = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'txn-123',
  userId: 'user-123',
  type: 'payment',
  amount: 9.99,
  currency: 'USD',
  status: 'completed',
  paymentId: 'payment-123',
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TransactionsService', () => {
  let transactionsService: TransactionsService;
  let transactionsRepository: MockTransactionsRepository;

  beforeEach(() => {
    transactionsRepository = {
      findById: vi.fn(),
      findByPaymentId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
    };

    transactionsService = new TransactionsService(
      transactionsRepository as TransactionsRepository,
    );
  });

  describe('findById', () => {
    it('should return transaction when found', async () => {
      const transaction = createMockTransaction();
      vi.mocked(transactionsRepository.findById).mockResolvedValue(transaction as any);

      const result = await transactionsService.findById('txn-123');

      expect(result).toEqual(transaction);
    });

    it('should throw NotFoundException when transaction not found', async () => {
      vi.mocked(transactionsRepository.findById).mockResolvedValue(null);

      await expect(transactionsService.findById('txn-123')).rejects.toThrow('Transaction not found');
    });
  });

  describe('findByPaymentId', () => {
    it('should return transactions by payment', async () => {
      const transactions = [createMockTransaction()];
      vi.mocked(transactionsRepository.findByPaymentId).mockResolvedValue(transactions as any);

      const result = await transactionsService.findByPaymentId('payment-123');

      expect(result).toEqual(transactions);
    });
  });

  describe('findByUserId', () => {
    it('should return transactions by user', async () => {
      const transactions = [createMockTransaction()];
      vi.mocked(transactionsRepository.findByUserId).mockResolvedValue(transactions as any);

      const result = await transactionsService.findByUserId('user-123');

      expect(result).toEqual(transactions);
    });
  });

  describe('create', () => {
    it('should create transaction', async () => {
      const transaction = createMockTransaction();
      vi.mocked(transactionsRepository.create).mockResolvedValue(transaction as any);

      const result = await transactionsService.create({
        userId: 'user-123',
        type: 'payment',
        amount: 9.99,
        currency: 'USD',
        status: 'completed',
        paymentId: 'payment-123',
      } as any);

      expect(result).toEqual(transaction);
    });
  });
});
