import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrizeTransactionsService } from './prize-transactions.service.js';
import type { PrizeTransactionsRepository } from '../repositories/prize-transactions.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

type MockPrizeTransactionsRepository = Partial<PrizeTransactionsRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockPrizeTransaction = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'prize-txn-123',
  contestId: 'contest-123',
  userId: 'user-123',
  amount: 100,
  currency: 'USD',
  status: 'pending',
  transactionId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrizeTransactionsService', () => {
  let prizeTransactionsService: PrizeTransactionsService;
  let prizeTransactionsRepository: MockPrizeTransactionsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    prizeTransactionsRepository = {
      findById: vi.fn(),
      findByContestId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    prizeTransactionsService = new PrizeTransactionsService(
      prizeTransactionsRepository as PrizeTransactionsRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return prize transaction when found', async () => {
      const txn = createMockPrizeTransaction();
      vi.mocked(prizeTransactionsRepository.findById).mockResolvedValue(txn as any);

      const result = await prizeTransactionsService.findById('prize-txn-123');

      expect(result).toEqual(txn);
    });

    it('should throw NotFoundException when prize transaction not found', async () => {
      vi.mocked(prizeTransactionsRepository.findById).mockResolvedValue(null);

      await expect(prizeTransactionsService.findById('prize-txn-123')).rejects.toThrow('Prize transaction not found');
    });
  });

  describe('findByContestId', () => {
    it('should return prize transactions by contest', async () => {
      const txns = [createMockPrizeTransaction()];
      vi.mocked(prizeTransactionsRepository.findByContestId).mockResolvedValue(txns as any);

      const result = await prizeTransactionsService.findByContestId('contest-123');

      expect(result).toEqual(txns);
    });
  });

  describe('findByUserId', () => {
    it('should return prize transactions by user', async () => {
      const txns = [createMockPrizeTransaction()];
      vi.mocked(prizeTransactionsRepository.findByUserId).mockResolvedValue(txns as any);

      const result = await prizeTransactionsService.findByUserId('user-123');

      expect(result).toEqual(txns);
    });
  });

  describe('create', () => {
    it('should create prize transaction', async () => {
      const txn = createMockPrizeTransaction();
      vi.mocked(prizeTransactionsRepository.create).mockResolvedValue(txn as any);

      const result = await prizeTransactionsService.create({
        contestId: 'contest-123',
        userId: 'user-123',
        amount: 100,
        currency: 'USD',
      } as any);

      expect(result).toEqual(txn);
    });
  });

  describe('update', () => {
    it('should update prize transaction', async () => {
      const updatedTxn = createMockPrizeTransaction({ status: 'completed' });
      vi.mocked(prizeTransactionsRepository.findById).mockResolvedValue(createMockPrizeTransaction() as any);
      vi.mocked(prizeTransactionsRepository.update).mockResolvedValue(updatedTxn as any);

      const result = await prizeTransactionsService.update('prize-txn-123', { status: 'completed' } as any);

      expect(result).toEqual(updatedTxn);
    });
  });
});
