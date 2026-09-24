import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import type { IPaymentsRepository } from './interfaces/payments-repository.interface.js';
import { PAYMENTS_REPOSITORY } from './interfaces/payments-repository.interface.js';
import type { Payment, CreatePaymentInput, PaymentTransaction, Refund } from './types.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockPaymentsRepository = Partial<IPaymentsRepository>;

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockEventEmitter = {
  emit: ReturnType<typeof vi.fn>;
};

describe('PaymentsService', () => {
  let paymentsService: PaymentsService;
  let paymentsRepository: MockPaymentsRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventEmitter: MockEventEmitter;

  const mockPayment: Payment = {
    id: 'payment-123',
    userId: 'user-123',
    amount: 1000,
    currency: 'EGP',
    status: 'pending',
    paymentMethod: 'paymob',
    paymobOrderId: 'order-123',
    paymobPaymentId: 'pay-123',
    paymobTransactionId: 'txn-123',
    metadata: { description: 'Test payment' },
    description: 'Test payment',
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    paymentsRepository = {
      findById: vi.fn(),
      findByOrderId: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      createTransaction: vi.fn(),
      createRefund: vi.fn(),
      findRefundsByPayment: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    valkeyService = {
      exists: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    paymentsService = new PaymentsService(
      paymentsRepository as unknown as IPaymentsRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('createPayment', () => {
    it('should create a payment successfully', async () => {
      const createInput: CreatePaymentInput = {
        userId: 'user-123',
        amount: 1000,
        paymentMethod: 'paymob',
      };

      vi.mocked(paymentsRepository.create).mockResolvedValue({
        ...mockPayment,
        ...createInput,
        id: 'payment-456',
      });

      const result = await paymentsService.createPayment(createInput);

      expect(result).toHaveProperty('id', 'payment-456');
      expect(result.amount).toBe(1000);
      expect(result.status).toBe('pending');
      expect(paymentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          amount: 1000,
          paymentMethod: 'paymob',
          currency: 'EGP',
          status: 'pending',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.created', expect.any(Object));
    });
  });

  describe('findById', () => {
    it('should return a payment by id', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await paymentsService.findById('payment-123');

      expect(result).toEqual(mockPayment);
      expect(paymentsRepository.findById).toHaveBeenCalledWith('payment-123');
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.findById('payment-999')).rejects.toThrow('Payment not found');
    });
  });

  describe('findAll', () => {
    it('should return paginated payments', async () => {
      const mockPayments = [mockPayment];
      vi.mocked(paymentsRepository.findAll).mockResolvedValue({ payments: mockPayments, total: 1 });

      const result = await paymentsService.findAll({ page: 1, limit: 20 });

      expect(result.payments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('updateStatus', () => {
    it('should update payment status', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'completed' });

      const result = await paymentsService.updateStatus('payment-123', 'completed');

      expect(result.status).toBe('completed');
      expect(paymentsRepository.update).toHaveBeenCalledWith('payment-123', { status: 'completed' });
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.updateStatus('payment-999', 'completed')).rejects.toThrow('Payment not found');
    });
  });

  describe('createRefund', () => {
    it('should create a refund successfully', async () => {
      const completedPayment = { ...mockPayment, status: 'completed' as const };
      vi.mocked(paymentsRepository.findById).mockResolvedValue(completedPayment);
      vi.mocked(paymentsRepository.createRefund).mockResolvedValue({
        id: 'refund-123',
        paymentId: 'payment-123',
        amount: 500,
        currency: 'EGP',
        reason: 'Customer request',
        status: 'pending',
        paymobRefundId: null,
        metadata: null,
        createdAt: new Date(),
      });

      const result = await paymentsService.createRefund('payment-123', 500, 'Customer request');

      expect(result.amount).toBe(500);
      expect(result.reason).toBe('Customer request');
      expect(paymentsRepository.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment-123',
          amount: 500,
          currency: 'EGP',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('refund.created', expect.any(Object));
    });

    it('should throw BadRequestException when payment is not completed', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);

      await expect(paymentsService.createRefund('payment-123', 500)).rejects.toThrow('Cannot refund a payment that is not completed');
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.createRefund('payment-999', 500)).rejects.toThrow('Payment not found');
    });
  });

  describe('paymobInitializePayment', () => {
    it('should initialize a Paymob payment', async () => {
      vi.mocked(paymentsRepository.create).mockResolvedValue({
        ...mockPayment,
        id: 'payment-new',
      });
      vi.mocked(paymentsRepository.update).mockResolvedValue({
        ...mockPayment,
        id: 'payment-new',
        status: 'processing',
        paymobOrderId: 'order-new',
      });

      const result = await paymentsService.paymobInitializePayment('user-123', 1000, 'EGP', { description: 'Test' });

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('paymobUrl');
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.created', expect.any(Object));
    });
  });

  describe('paymobCallback', () => {
    it('should handle successful Paymob callback', async () => {
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'completed' });
      vi.mocked(paymentsRepository.createTransaction).mockResolvedValue({
        id: 'txn-456',
        paymentId: 'payment-123',
        type: 'capture',
        status: 'completed',
        amount: 1000,
        currency: 'EGP',
        gatewayResponse: null,
        createdAt: new Date(),
      });

      const result = await paymentsService.paymobCallback('order-123', 'pay-123', 'txn-123', 'success');

      expect(result.status).toBe('completed');
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.completed', expect.any(Object));
    });

    it('should handle failed Paymob callback', async () => {
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'failed' });
      vi.mocked(paymentsRepository.createTransaction).mockResolvedValue({
        id: 'txn-456',
        paymentId: 'payment-123',
        type: 'capture',
        status: 'failed',
        amount: 1000,
        currency: 'EGP',
        gatewayResponse: null,
        createdAt: new Date(),
      });

      const result = await paymentsService.paymobCallback('order-123', 'pay-123', 'txn-123', 'failed');

      expect(result.status).toBe('failed');
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.failed', expect.any(Object));
    });
  });

  describe('getRefunds', () => {
    it('should return refunds for a payment', async () => {
      const mockRefunds: Refund[] = [
        {
          id: 'refund-123',
          paymentId: 'payment-123',
          amount: 500,
          currency: 'EGP',
          reason: 'Customer request',
          status: 'pending',
          paymobRefundId: null,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      vi.mocked(paymentsRepository.findRefundsByPayment).mockResolvedValue(mockRefunds);

      const result = await paymentsService.getRefunds('payment-123');

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(500);
      expect(paymentsRepository.findRefundsByPayment).toHaveBeenCalledWith('payment-123');
    });
  });
});
