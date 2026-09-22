import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefundsService } from './refunds.service.js';
import type { RefundsRepository } from '../repositories/refunds.repository.js';
import { NotFoundException } from '@nestjs/common';

type MockRefundsRepository = Partial<RefundsRepository>;

const createMockRefund = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'refund-123',
  paymentId: 'payment-123',
  userId: 'user-123',
  amount: 9.99,
  currency: 'USD',
  reason: 'Customer request',
  status: 'pending',
  processedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('RefundsService', () => {
  let refundsService: RefundsService;
  let refundsRepository: MockRefundsRepository;

  beforeEach(() => {
    refundsRepository = {
      findById: vi.fn(),
      findByPaymentId: vi.fn(),
      findByRefundedBy: vi.fn(),
      create: vi.fn(),
    };

    refundsService = new RefundsService(
      refundsRepository as RefundsRepository,
    );
  });

  describe('findById', () => {
    it('should return refund when found', async () => {
      const refund = createMockRefund();
      vi.mocked(refundsRepository.findById).mockResolvedValue(refund as any);

      const result = await refundsService.findById('refund-123');

      expect(result).toEqual(refund);
    });

    it('should throw NotFoundException when refund not found', async () => {
      vi.mocked(refundsRepository.findById).mockResolvedValue(null);

      await expect(refundsService.findById('refund-123')).rejects.toThrow('Refund not found');
    });
  });

  describe('findByPaymentId', () => {
    it('should return refund by payment', async () => {
      const refund = createMockRefund();
      vi.mocked(refundsRepository.findByPaymentId).mockResolvedValue(refund as any);

      const result = await refundsService.findByPaymentId('payment-123');

      expect(result).toEqual(refund);
    });
  });

  describe('findByRefundedBy', () => {
    it('should return refunds by refunded by', async () => {
      const refunds = [createMockRefund()];
      vi.mocked(refundsRepository.findByRefundedBy).mockResolvedValue(refunds as any);

      const result = await refundsService.findByRefundedBy('user-123');

      expect(result).toEqual(refunds);
    });
  });

  describe('create', () => {
    it('should create refund', async () => {
      const refund = createMockRefund();
      vi.mocked(refundsRepository.create).mockResolvedValue(refund as any);

      const result = await refundsService.create({
        paymentId: 'payment-123',
        userId: 'user-123',
        amount: 9.99,
        currency: 'USD',
        reason: 'Customer request',
        status: 'pending',
      } as any);

      expect(result).toEqual(refund);
    });
  });
});
