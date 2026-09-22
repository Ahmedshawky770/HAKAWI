import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import type { PaymentsRepository } from '../repositories/payments.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { CreatePaymentDto } from '../dto/payments.dto.js';

type MockPaymentsRepository = Partial<PaymentsRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockPayment = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'payment-123',
  userId: 'user-123',
  amount: 9.99,
  currency: 'USD',
  status: 'pending',
  transactionId: null,
  paymentMethodId: null,
  metadata: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PaymentsService', () => {
  let paymentsService: PaymentsService;
  let paymentsRepository: MockPaymentsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    paymentsRepository = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    paymentsService = new PaymentsService(
      paymentsRepository as PaymentsRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return payment when found and userId matches', async () => {
      const payment = createMockPayment({ userId: 'user-123' });
      vi.mocked(paymentsRepository.findById).mockResolvedValue(payment as any);

      const result = await paymentsService.findById('payment-123', 'user-123');

      expect(result).toEqual(payment);
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.findById('payment-123', 'user-123')).rejects.toThrow('Payment not found');
    });

    it('should throw NotFoundException when userId does not match', async () => {
      const payment = createMockPayment({ userId: 'other-user' });
      vi.mocked(paymentsRepository.findById).mockResolvedValue(payment as any);

      await expect(paymentsService.findById('payment-123', 'user-123')).rejects.toThrow('Payment not found');
    });
  });

  describe('findByUserId', () => {
    it('should return payments by user', async () => {
      const payments = [createMockPayment()];
      vi.mocked(paymentsRepository.findByUserId).mockResolvedValue(payments as any);

      const result = await paymentsService.findByUserId('user-123');

      expect(result).toEqual(payments);
    });
  });

  describe('create', () => {
    it('should create payment and emit event', async () => {
      const payment = createMockPayment();
      const data: CreatePaymentDto = {
        amount: 9.99,
        currency: 'USD',
        status: 'pending',
      };
      vi.mocked(paymentsRepository.create).mockResolvedValue(payment as any);

      const result = await paymentsService.create('user-123', data);

      expect(result).toEqual(payment);
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.initiated', {
        paymentId: 'payment-123',
        userId: 'user-123',
        amount: 9.99,
        currency: 'USD',
      });
    });
  });

  describe('complete', () => {
    it('should complete payment and emit event', async () => {
      const payment = createMockPayment({ status: 'pending', userId: 'user-123', amount: 9.99 });
      const updatedPayment = createMockPayment({ status: 'completed', transactionId: 'txn-123', completedAt: new Date() });
      vi.mocked(paymentsRepository.findById).mockResolvedValue(payment as any);
      vi.mocked(paymentsRepository.update).mockResolvedValue(updatedPayment as any);

      const result = await paymentsService.complete('payment-123', 'txn-123');

      expect(result).toEqual(updatedPayment);
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.completed', {
        paymentId: 'payment-123',
        userId: 'user-123',
        amount: 9.99,
        transactionId: 'txn-123',
      });
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.complete('payment-123', 'txn-123')).rejects.toThrow('Payment not found');
    });
  });

  describe('refund', () => {
    it('should refund completed payment', async () => {
      const payment = createMockPayment({ status: 'completed', userId: 'user-123' });
      const updatedPayment = createMockPayment({ status: 'refunded' });
      vi.mocked(paymentsRepository.findById).mockResolvedValue(payment as any);
      vi.mocked(paymentsRepository.update).mockResolvedValue(updatedPayment as any);

      const result = await paymentsService.refund('payment-123', 'user-123', { amount: 9.99, reason: 'Customer request' });

      expect(paymentsRepository.update).toHaveBeenCalledWith('payment-123', { status: 'refunded' });
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.refund('payment-123', 'user-123', { amount: 9.99, reason: 'Test' }))
        .rejects.toThrow('Payment not found');
    });

    it('should throw NotFoundException when userId does not match', async () => {
      const payment = createMockPayment({ userId: 'other-user', status: 'completed' });
      vi.mocked(paymentsRepository.findById).mockResolvedValue(payment as any);

      await expect(paymentsService.refund('payment-123', 'user-123', { amount: 9.99, reason: 'Test' }))
        .rejects.toThrow('Payment not found');
    });

    it('should throw BadRequestException when payment is not completed', async () => {
      const payment = createMockPayment({ userId: 'user-123', status: 'pending' });
      vi.mocked(paymentsRepository.findById).mockResolvedValue(payment as any);

      await expect(paymentsService.refund('payment-123', 'user-123', { amount: 9.99, reason: 'Test' }))
        .rejects.toThrow('Only completed payments can be refunded');
    });
  });
});
