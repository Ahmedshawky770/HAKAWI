import * as crypto from 'crypto';

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { type PaymobConfig } from '../../config/paymob.config.ts';

import { PaymentsService } from './payments.service.ts';
import type { PaymobCheckout, PaymobRefundResult } from './clients/paymob.schemas.ts';
import type { PaymobGateway, PaymobCheckoutRequest, PaymobRefundRequestInput } from './clients/paymob.client.ts';
import { PaymobGatewayError } from './clients/paymob.client.ts';
import type {
  Payment,
  PaymentTransaction,
  Refund,
  CreatePaymentInput,
  RefundCapacityReconciliation,
  RefundReservation,
} from './interfaces/payments-repository.interface.ts';
import {
  RefundCapacityExceededError,
  RefundablePaymentNotFoundError,
} from './interfaces/payments-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

/**
 * `crypto.timingSafeEqual` cannot be spied on directly: an ES module namespace is frozen, so
 * `vi.spyOn` throws. It is wrapped at the module boundary instead, delegating to the real
 * implementation so the signature check keeps working while the call becomes observable.
 */
const cryptoSpies = vi.hoisted(() => ({ timingSafeEqual: vi.fn() }));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  cryptoSpies.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: cryptoSpies.timingSafeEqual };
});

type MockPaymentsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Payment | null>>>;
  findByOrderId: ReturnType<typeof vi.fn<(orderId: string) => Promise<Payment | null>>>;
  findByTransactionId: ReturnType<typeof vi.fn<(transactionId: string) => Promise<Payment | null>>>;
  findAll: ReturnType<
    typeof vi.fn<
      (params: {
        userId?: string;
        status?: string;
        page?: number;
        limit?: number;
      }) => Promise<{ payments: Payment[]; total: number }>
    >
  >;
  create: ReturnType<typeof vi.fn<(data: CreatePaymentInput) => Promise<Payment>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<Payment>) => Promise<Payment>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  createTransaction: ReturnType<
    typeof vi.fn<
      (data: {
        paymentId: string;
        type: string;
        status: string;
        amount: number;
        currency: string;
        gatewayResponse?: string | null;
      }) => Promise<PaymentTransaction>
    >
  >;
  createRefund: ReturnType<
    typeof vi.fn<
      (data: {
        paymentId: string;
        amount: number;
        reason?: string | null;
        status?: string;
        paymobRefundId?: string | null;
        metadata?: string | null;
      }) => Promise<Refund>
    >
  >;
  updateRefund: ReturnType<typeof vi.fn<(id: string, data: Partial<Refund>) => Promise<Refund>>>;
  findRefundsByPayment: ReturnType<typeof vi.fn<(paymentId: string) => Promise<Refund[]>>>;
  reserveRefundCapacity: ReturnType<
    typeof vi.fn<
      (input: {
        paymentId: string;
        amountCents: number;
        currency: string;
        reason?: string | null;
      }) => Promise<RefundReservation>
    >
  >;
  reconcileRefundCapacity: ReturnType<typeof vi.fn<(paymentId: string) => Promise<RefundCapacityReconciliation>>>;
};

type MockPaymobGateway = {
  createCheckout: ReturnType<typeof vi.fn<(request: PaymobCheckoutRequest) => Promise<PaymobCheckout>>>;
  refundTransaction: ReturnType<typeof vi.fn<(request: PaymobRefundRequestInput) => Promise<PaymobRefundResult>>>;
  invalidateAuthToken: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

const WEBHOOK_SECRET = 'test-webhook-secret-that-is-long-enough-1234567890';

const TEST_PAYMOB_CONFIG: PaymobConfig = {
  environment: 'sandbox',
  apiKey: 'api-key',
  merchantId: 'merchant-1',
  integrationId: 'integration-1',
  webhookSecret: WEBHOOK_SECRET,
  baseUrl: 'https://accept.paymob.com/api',
  requestTimeoutMs: 5000,
  authTimeoutMs: 4000,
  authTokenCacheTtlSeconds: 3000,
  retryMaxAttempts: 0,
};

/**
 * A cache double that goes through a real `JSON.stringify`/`JSON.parse` round trip.
 *
 * The previous version returned the stored object by reference, which made every test pass while
 * hiding the defect it existed for: `TaggedCacheService` persists with `JSON.stringify`, so a hit
 * genuinely hands back ISO strings where the loader returned `Date` objects. Serialising here means
 * a test cannot accidentally exercise a cache shape production never produces.
 *
 * It also mirrors the real self-healing: an entry a `revive` cannot restore is dropped and reported
 * as a miss, exactly as `TaggedCacheService.get` does, rather than propagating an exception.
 */
function createFakeTaggedCache(): {
  store: Map<string, string>;
  get: Mock<(namespace: string, key: string, revive?: (value: never) => never) => Promise<unknown>>;
  set: Mock<(namespace: string, key: string, value: unknown, ttl: number, tags?: readonly string[]) => Promise<void>>;
  getOrSet: Mock;
  invalidateKey: Mock<(namespace: string, key: string) => Promise<void>>;
  invalidateTags: Mock<(tags: readonly string[]) => Promise<number>>;
} {
  const store = new Map<string, string>();
  const cache = {
    store,
    get: vi.fn(async (namespace: string, key: string, revive?: (value: never) => never) => {
      const cacheKey = `${namespace}:${key}`;
      const raw = store.get(cacheKey);
      if (raw === undefined) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw) as never;
        return revive === undefined ? parsed : revive(parsed);
      } catch {
        store.delete(cacheKey);
        return null;
      }
    }),
    set: vi.fn(async (namespace: string, key: string, value: unknown) => {
      store.set(`${namespace}:${key}`, JSON.stringify(value));
    }),
    getOrSet: vi.fn(
      async (options: {
        namespace: string;
        key: string;
        load: () => Promise<unknown>;
        revive?: (value: never) => never;
      }) => {
        const cached = await cache.get(options.namespace, options.key, options.revive);
        if (cached !== null) {
          return { value: cached, hit: true };
        }
        const value = await options.load();
        await cache.set(options.namespace, options.key, value);
        return { value, hit: false };
      },
    ),
    invalidateKey: vi.fn(async (namespace: string, key: string) => {
      store.delete(`${namespace}:${key}`);
    }),
    invalidateTags: vi.fn(async () => 0),
  };
  return cache;
}

describe('PaymentsService', () => {
  let paymentsService: PaymentsService;
  let paymentsRepository: MockPaymentsRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: ReturnType<typeof createFakeTaggedCache>;
  let eventValidatorService: MockEventValidatorService;
  let paymobGateway: MockPaymobGateway;

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
    paymobPaymentKey: null,
    paymobIframeUrl: null,
    paymobAcceptUrl: null,
    metadata: '{"description": "Test payment"}',
    description: 'Test payment',
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  /** Builds what `reserveRefundCapacity` returns for a payment with `alreadyRefunded` reserved. */
  const reservationFor = (overrides: {
    payment?: Payment;
    amountCents: number;
    alreadyRefunded?: number;
  }): RefundReservation => {
    const payment = overrides.payment ?? { ...mockPayment, status: 'completed' };
    const alreadyRefunded = overrides.alreadyRefunded ?? 0;
    const reservedTotal = alreadyRefunded + overrides.amountCents;
    return {
      payment,
      refund: {
        id: 'refund-123',
        paymentId: payment.id,
        amount: overrides.amountCents,
        currency: payment.currency,
        reason: null,
        status: 'pending',
        paymobRefundId: null,
        metadata: null,
        createdAt: new Date(),
      },
      alreadyRefunded,
      reservedTotal,
      paymentFullyRefunded: reservedTotal === payment.amount,
    };
  };

  beforeEach(() => {
    paymentsRepository = {
      findById: vi.fn<(id: string) => Promise<Payment | null>>(),
      findByOrderId: vi.fn<(orderId: string) => Promise<Payment | null>>(),
      findByTransactionId: vi.fn<(transactionId: string) => Promise<Payment | null>>(),
      findAll:
        vi.fn<
          (params: {
            userId?: string;
            status?: string;
            page?: number;
            limit?: number;
          }) => Promise<{ payments: Payment[]; total: number }>
        >(),
      create: vi.fn<(data: CreatePaymentInput) => Promise<Payment>>(),
      update: vi.fn<(id: string, data: Partial<Payment>) => Promise<Payment>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      createTransaction:
        vi.fn<
          (data: {
            paymentId: string;
            type: string;
            status: string;
            amount: number;
            currency: string;
            gatewayResponse?: string | null;
          }) => Promise<PaymentTransaction>
        >(),
      createRefund:
        vi.fn<
          (data: {
            paymentId: string;
            amount: number;
            reason?: string | null;
            status?: string;
            paymobRefundId?: string | null;
            metadata?: string | null;
          }) => Promise<Refund>
        >(),
      updateRefund: vi.fn<(id: string, data: Partial<Refund>) => Promise<Refund>>(),
      findRefundsByPayment: vi.fn<(paymentId: string) => Promise<Refund[]>>(),
      reserveRefundCapacity:
        vi.fn<
          (input: {
            paymentId: string;
            amountCents: number;
            currency: string;
            reason?: string | null;
          }) => Promise<RefundReservation>
        >(),
      reconcileRefundCapacity: vi.fn<(paymentId: string) => Promise<RefundCapacityReconciliation>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    valkeyService = createFakeTaggedCache();

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    paymobGateway = {
      createCheckout: vi.fn<(request: PaymobCheckoutRequest) => Promise<PaymobCheckout>>(),
      refundTransaction: vi.fn<(request: PaymobRefundRequestInput) => Promise<PaymobRefundResult>>(),
      invalidateAuthToken: vi.fn<() => Promise<void>>(),
    };

    vi.mocked(paymobGateway.createCheckout).mockResolvedValue({
      orderId: 'paymob-order-999',
      paymentKey: 'paymob-key-777',
      iframeUrl: 'https://accept.paymob.com/acceptance/iframes/paymob-key-777?merchant_id=merchant-1',
      acceptUrl: 'https://accept.paymob.com/acceptance/accepts/paymob-key-777?merchant_id=merchant-1',
    });

    vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);
    vi.mocked(paymentsRepository.updateRefund).mockImplementation(async (id, patch) => ({
      id,
      paymentId: 'payment-123',
      amount: 500,
      currency: 'EGP',
      reason: null,
      status: 'pending',
      paymobRefundId: null,
      metadata: null,
      createdAt: new Date(),
      ...patch,
    }));
    vi.mocked(paymentsRepository.reconcileRefundCapacity).mockImplementation(async (paymentId) => ({
      payment: { ...mockPayment, id: paymentId, status: 'completed' },
      reservedTotal: 0,
      paymentFullyRefunded: false,
    }));

    paymentsService = new PaymentsService(
      paymentsRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as unknown as TaggedCacheService,
      eventValidatorService as unknown as EventValidatorService,
      paymobGateway as unknown as PaymobGateway,
      TEST_PAYMOB_CONFIG,
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
      expect(eventValidatorService.emit).toHaveBeenCalledWith('payment.created', expect.any(Object));
    });
  });

  describe('findById', () => {
    it('should return a payment by id', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);

      const result = await paymentsService.findById('payment-123');

      expect(result).toEqual(mockPayment);
      expect(paymentsRepository.findById).toHaveBeenCalledWith('payment-123');
    });

    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.findById('payment-999')).rejects.toThrow('Payment not found');
    });

    it('returns the same shape on a cache hit as on a cache miss', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);

      const miss = await paymentsService.findById('payment-123');
      const hit = await paymentsService.findById('payment-123');

      // The double above serialises on write and deserialises on read, exactly as Valkey does, so
      // the second call really does see what `JSON.stringify` produced. Without `revive` the hit
      // would carry ISO strings in fields the `Payment` type declares as `Date`.
      expect(valkeyService.store.get('payment:payment-123')).toBeTypeOf('string');
      expect(miss.createdAt).toBeInstanceOf(Date);
      expect(hit.createdAt).toBeInstanceOf(Date);
      expect(hit.updatedAt).toBeInstanceOf(Date);
      expect(hit.deletedAt).toBeNull();
      expect(hit.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(hit).toEqual(miss);
      // Served from cache, not reloaded.
      expect(paymentsRepository.findById).toHaveBeenCalledTimes(1);
    });

    it('heals a cache entry whose dates cannot be revived instead of throwing', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);

      await paymentsService.findById('payment-123');
      // Exactly what a hand-edited or truncated cache entry would look like.
      valkeyService.store.set('payment:payment-123', JSON.stringify({ ...mockPayment, createdAt: 'not-a-date' }));

      const result = await paymentsService.findById('payment-123');

      // The corrupt entry is dropped and reported as a miss, so the caller gets a usable object
      // instead of a 500 — and the repository was consulted again to produce it.
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(paymentsRepository.findById).toHaveBeenCalledTimes(2);
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
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockResolvedValue(
        reservationFor({ payment: completedPayment, amountCents: 500 }),
      );
      vi.mocked(paymentsRepository.updateRefund).mockImplementation(async (_id, patch) => ({
        id: 'refund-123',
        paymentId: 'payment-123',
        amount: 500,
        currency: 'EGP',
        reason: 'Customer request',
        status: 'processed',
        paymobRefundId: 'paymob-refund-1',
        metadata: null,
        createdAt: new Date(),
        ...patch,
      }));
      vi.mocked(paymobGateway.refundTransaction).mockResolvedValue({
        refundId: 'paymob-refund-1',
        success: true,
        pending: false,
        isRefund: true,
        amountCents: 500,
        currency: 'EGP',
        raw: { id: 55, success: true, is_refund: true },
      });

      const result = await paymentsService.createRefund('payment-123', 500, 'Customer request');

      expect(result.amount).toBe(500);
      expect(result.reason).toBe('Customer request');
      expect(result.status).toBe('processed');
      expect(result.paymobRefundId).toBe('paymob-refund-1');
      expect(paymobGateway.refundTransaction).toHaveBeenCalledWith({ transactionId: 'txn-123', amountCents: 500 });
      expect(paymentsRepository.reserveRefundCapacity).toHaveBeenCalledWith({
        paymentId: 'payment-123',
        amountCents: 500,
        currency: 'EGP',
        reason: 'Customer request',
      });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('refund.created', expect.any(Object));
    });

    it('should throw BadRequestException when payment is not completed', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockResolvedValue(
        reservationFor({ payment: { ...mockPayment, status: 'pending' }, amountCents: 500 }),
      );

      await expect(paymentsService.createRefund('payment-123', 500)).rejects.toThrow(
        'Cannot refund a payment that is not completed',
      );
      // The reservation is compensated rather than left behind holding refund capacity.
      expect(paymentsRepository.updateRefund).toHaveBeenCalledWith(
        'refund-123',
        expect.objectContaining({ status: 'failed' }),
      );
      expect(paymentsRepository.reconcileRefundCapacity).toHaveBeenCalledWith('payment-123');
      expect(paymobGateway.refundTransaction).not.toHaveBeenCalled();
    });
    it('should throw NotFoundException when payment not found', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(null);

      await expect(paymentsService.createRefund('payment-999', 500)).rejects.toThrow('Payment not found');
      expect(paymentsRepository.reserveRefundCapacity).not.toHaveBeenCalled();
    });

    it('reports a missing payment found only inside the locked transaction as 404', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue({ ...mockPayment, status: 'completed' });
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockRejectedValue(
        new RefundablePaymentNotFoundError('payment-123'),
      );

      await expect(paymentsService.createRefund('payment-123', 500)).rejects.toThrow('Payment not found');
    });
  });

  describe('paymobInitializePayment', () => {
    beforeEach(() => {
      vi.mocked(paymentsRepository.create).mockResolvedValue({
        ...mockPayment,
        id: 'payment-new',
        paymobOrderId: null,
        paymobTransactionId: null,
      });
      vi.mocked(paymentsRepository.update).mockResolvedValue({
        ...mockPayment,
        id: 'payment-new',
        status: 'processing',
        paymobOrderId: 'paymob-order-999',
        paymobPaymentKey: 'paymob-key-777',
        paymobIframeUrl: 'https://accept.paymob.com/acceptance/iframes/paymob-key-777?merchant_id=merchant-1',
        paymobAcceptUrl: 'https://accept.paymob.com/acceptance/accepts/paymob-key-777?merchant_id=merchant-1',
      });
    });

    it('registers the order with the gateway and returns the real gateway identifiers', async () => {
      const result = await paymentsService.paymobInitializePayment('user-123', 1000, 'EGP', { description: 'Test' });

      expect(result).toEqual({
        paymentId: 'payment-new',
        orderId: 'paymob-order-999',
        paymentKey: 'paymob-key-777',
        iframeUrl: 'https://accept.paymob.com/acceptance/iframes/paymob-key-777?merchant_id=merchant-1',
        acceptUrl: 'https://accept.paymob.com/acceptance/accepts/paymob-key-777?merchant_id=merchant-1',
        status: 'processing',
      });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('payment.created', expect.any(Object));
    });

    it('sends the amount in minor units with the payment id as the merchant order id', async () => {
      await paymentsService.paymobInitializePayment('user-123', 1000, 'EGP');

      expect(paymobGateway.createCheckout).toHaveBeenCalledWith({
        amountCents: 1000,
        currency: 'EGP',
        merchantOrderId: 'payment-new',
      });
    });

    it('persists the real paymob order id, payment key and iframe url', async () => {
      await paymentsService.paymobInitializePayment('user-123', 1000, 'EGP');

      expect(paymentsRepository.update).toHaveBeenCalledWith('payment-new', {
        paymobOrderId: 'paymob-order-999',
        paymobPaymentKey: 'paymob-key-777',
        paymobIframeUrl: 'https://accept.paymob.com/acceptance/iframes/paymob-key-777?merchant_id=merchant-1',
        paymobAcceptUrl: 'https://accept.paymob.com/acceptance/accepts/paymob-key-777?merchant_id=merchant-1',
        status: 'processing',
      });
      expect(valkeyService.invalidateKey).toHaveBeenCalledWith('payment', 'payment-new');
    });

    it('normalises a lowercase currency before calling the gateway', async () => {
      await paymentsService.paymobInitializePayment('user-123', 1000, 'egp');

      expect(paymobGateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EGP' }));
    });

    it('rejects a non integer amount without calling the gateway', async () => {
      await expect(paymentsService.paymobInitializePayment('user-123', 10.5, 'EGP')).rejects.toThrow(
        'Invalid payment amount',
      );
      expect(paymobGateway.createCheckout).not.toHaveBeenCalled();
    });

    it('rejects a non positive amount without calling the gateway', async () => {
      await expect(paymentsService.paymobInitializePayment('user-123', 0, 'EGP')).rejects.toThrow(
        'Invalid payment amount',
      );
      expect(paymobGateway.createCheckout).not.toHaveBeenCalled();
    });

    it('rejects a malformed currency without calling the gateway', async () => {
      await expect(paymentsService.paymobInitializePayment('user-123', 100, 'EGPP')).rejects.toThrow(
        'Invalid payment currency',
      );
      expect(paymobGateway.createCheckout).not.toHaveBeenCalled();
    });

    it('fails the payment and returns 503 when the gateway is unreachable, fabricating no URL', async () => {
      vi.mocked(paymobGateway.createCheckout).mockRejectedValue(
        new PaymobGatewayError('order registration', 'HTTP 500 Internal Server Error', new Error('boom')),
      );

      await expect(paymentsService.paymobInitializePayment('user-123', 1000, 'EGP')).rejects.toThrow(
        /The payment gateway is unavailable/,
      );
      expect(paymentsRepository.update).toHaveBeenCalledWith('payment-new', { status: 'failed' });
      expect(valkeyService.invalidateKey).toHaveBeenCalledWith('payment', 'payment-new');
      const updateCalls = vi.mocked(paymentsRepository.update).mock.calls.map((call) => call[1]);
      expect(updateCalls).toEqual([{ status: 'failed' }]);
      expect(updateCalls.every((patch) => !('paymobIframeUrl' in patch) && !('paymobPaymentKey' in patch))).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'));
    });

    it('still records the local payment when the gateway fails so the audit trail is not lost', async () => {
      vi.mocked(paymobGateway.createCheckout).mockRejectedValue(new Error('socket hang up'));

      await expect(paymentsService.paymobInitializePayment('user-123', 1000, 'EGP')).rejects.toThrow(/socket hang up/);
      expect(paymentsRepository.create).toHaveBeenCalled();
    });
  });

  describe('createPayment with gateway initialisation', () => {
    it('leaves the payment local when initializeGateway is not requested', async () => {
      vi.mocked(paymentsRepository.create).mockResolvedValue({ ...mockPayment, id: 'payment-local' });

      await paymentsService.createPayment({ userId: 'user-123', amount: 100, paymentMethod: 'paymob' });

      expect(paymobGateway.createCheckout).not.toHaveBeenCalled();
    });

    it('registers the checkout when initializeGateway is requested', async () => {
      vi.mocked(paymentsRepository.create).mockResolvedValue({ ...mockPayment, id: 'payment-gw' });
      vi.mocked(paymentsRepository.update).mockResolvedValue({
        ...mockPayment,
        id: 'payment-gw',
        status: 'processing',
        paymobOrderId: 'paymob-order-999',
      });

      const payment = await paymentsService.createPayment(
        { userId: 'user-123', amount: 100, paymentMethod: 'paymob' },
        { initializeGateway: true },
      );

      expect(paymobGateway.createCheckout).toHaveBeenCalledWith({
        amountCents: 100,
        currency: 'EGP',
        merchantOrderId: 'payment-gw',
      });
      expect(payment.status).toBe('processing');
      expect(payment.paymobOrderId).toBe('paymob-order-999');
    });

    it('refuses to initialise the gateway for a non paymob payment method', async () => {
      vi.mocked(paymentsRepository.create).mockResolvedValue({ ...mockPayment, id: 'payment-stripe' });

      await expect(
        paymentsService.createPayment(
          { userId: 'user-123', amount: 100, paymentMethod: 'stripe' },
          { initializeGateway: true },
        ),
      ).rejects.toThrow('initializeGateway is only supported for the paymob payment method');
      expect(paymobGateway.createCheckout).not.toHaveBeenCalled();
    });
  });

  describe('cumulative refund capacity', () => {
    const completedPayment = { ...mockPayment, status: 'completed' as const };

    beforeEach(() => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(completedPayment);
    });

    it('admits partial refunds that accumulate up to the captured amount', async () => {
      // 400 then 600 against a 1000 capture: the second call must see the first one's reservation.
      vi.mocked(paymentsRepository.reserveRefundCapacity)
        .mockResolvedValueOnce(reservationFor({ payment: completedPayment, amountCents: 400, alreadyRefunded: 0 }))
        .mockResolvedValueOnce(reservationFor({ payment: completedPayment, amountCents: 600, alreadyRefunded: 400 }));
      vi.mocked(paymobGateway.refundTransaction).mockResolvedValue({
        refundId: 'rf-1',
        success: true,
        pending: false,
        isRefund: true,
        amountCents: 1000,
        currency: 'EGP',
        raw: { id: 1, success: true },
      });

      await paymentsService.createRefund('payment-123', 400);
      const second = await paymentsService.createRefund('payment-123', 600);

      expect(second.status).toBe('processed');
      expect(paymentsRepository.reserveRefundCapacity).toHaveBeenNthCalledWith(2, {
        paymentId: 'payment-123',
        amountCents: 600,
        currency: 'EGP',
        reason: null,
      });
    });

    it('marks the payment refunded when the reservation reaches the captured amount', async () => {
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockResolvedValue(
        reservationFor({ payment: completedPayment, amountCents: 1000, alreadyRefunded: 0 }),
      );
      vi.mocked(paymobGateway.refundTransaction).mockResolvedValue({
        refundId: 'rf-2',
        success: true,
        pending: false,
        isRefund: true,
        amountCents: 1000,
        currency: 'EGP',
        raw: { id: 2, success: true },
      });

      await paymentsService.createRefund('payment-123', 1000);

      // `paymentFullyRefunded` is the repository's signal that it flipped the payment status inside
      // the same transaction as the insert, so the service issues no second write of its own.
      const [call] = vi.mocked(paymentsRepository.reserveRefundCapacity).mock.calls;
      const reserved: RefundReservation = { ...reservationFor({ amountCents: 1000 }), ...call };
      expect(reserved.paymentFullyRefunded).toBe(true);
    });

    it('rejects a refund that would exceed the cap once earlier refunds are counted', async () => {
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockRejectedValue(
        new RefundCapacityExceededError(700, 400, 1000),
      );

      await expect(paymentsService.createRefund('payment-123', 700)).rejects.toThrow(
        'Refund amount 700 exceeds the remaining refundable amount 600 (400 of 1000 already refunded)',
      );
      expect(paymobGateway.refundTransaction).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalledWith('refund.created', expect.anything());
    });

    it('rejects a refund of exactly zero remaining capacity', async () => {
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockRejectedValue(
        new RefundCapacityExceededError(100, 1000, 1000),
      );

      await expect(paymentsService.createRefund('payment-123', 100)).rejects.toThrow(
        'exceeds the remaining refundable amount 0',
      );
    });

    it('keeps the original message when nothing has been refunded yet', async () => {
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockRejectedValue(
        new RefundCapacityExceededError(5000, 0, 1000),
      );

      await expect(paymentsService.createRefund('payment-123', 5000)).rejects.toThrow(
        'Refund amount 5000 exceeds the captured amount 1000',
      );
    });

    it('lets only one of two concurrent refunds for the same payment win', async () => {
      // Both requests arrive while the payment is `completed` and both ask for the whole capture.
      // The `FOR UPDATE` lock is what separates them: the loser reads the winner's committed
      // reservation under the same lock and is refused, so the gateway is called exactly once.
      const admitted = reservationFor({ payment: completedPayment, amountCents: 1000, alreadyRefunded: 0 });
      let reservedByWinner: number | undefined;
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockImplementation(async (input) => {
        if (reservedByWinner === undefined) {
          reservedByWinner = input.amountCents;
          return admitted;
        }
        // The second request to arrive reads the first one's reservation under the same lock.
        throw new RefundCapacityExceededError(input.amountCents, reservedByWinner, 1000);
      });
      vi.mocked(paymobGateway.refundTransaction).mockResolvedValue({
        refundId: 'rf-3',
        success: true,
        pending: false,
        isRefund: true,
        amountCents: 1000,
        currency: 'EGP',
        raw: { id: 3, success: true },
      });

      const results = await Promise.allSettled([
        paymentsService.createRefund('payment-123', 1000, 'first'),
        paymentsService.createRefund('payment-123', 1000, 'second'),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(paymobGateway.refundTransaction).toHaveBeenCalledTimes(1);
      const refusal = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      const reason: unknown = refusal.reason;
      expect(reason).toBeInstanceOf(BadRequestException);
      expect((reason as BadRequestException).message).toMatch(/already refunded/);
      // The loser never reached the gateway and never emitted a refund row.
      expect(eventValidatorService.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('refund submission to the gateway', () => {
    const completedPayment = { ...mockPayment, status: 'completed' as const };

    beforeEach(() => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue(completedPayment);
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockResolvedValue(
        reservationFor({ payment: completedPayment, amountCents: 500 }),
      );
    });

    it('raises a 400 when the payment has no Paymob transaction id, and emits refund.failed', async () => {
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockResolvedValue(
        reservationFor({ payment: { ...completedPayment, paymobTransactionId: null }, amountCents: 500 }),
      );

      // The route is `@HttpCode(HttpStatus.CREATED)`, so a swallowed failure used to answer 201 with
      // `status: 'failed'`. A retryable-by-nobody failure must not be reported as created.
      const failure = await paymentsService.createRefund('payment-123', 500).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).getStatus()).toBe(400);
      expect((failure as BadRequestException).message).toMatch(/no Paymob transaction id/);
      expect(paymobGateway.refundTransaction).not.toHaveBeenCalled();
      expect(paymentsRepository.updateRefund).toHaveBeenCalledWith(
        'refund-123',
        expect.objectContaining({ status: 'failed' }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('refund.failed', {
        paymentId: 'payment-123',
        refundId: 'refund-123',
      });
    });

    it('raises a 503 when the gateway rejects the refund, and emits refund.failed', async () => {
      vi.mocked(paymobGateway.refundTransaction).mockRejectedValue(
        new PaymobGatewayError('refund', 'HTTP 422 Unprocessable Entity', new Error('rejected')),
      );

      const failure = await paymentsService.createRefund('payment-123', 500).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
      expect((failure as ServiceUnavailableException).message).toMatch(/HTTP 422/);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('HTTP 422'));
      expect(eventValidatorService.emit).toHaveBeenCalledWith('refund.failed', expect.any(Object));
      // Capacity is handed back, so the customer can be refunded again once the gateway recovers.
      expect(paymentsRepository.reconcileRefundCapacity).toHaveBeenCalledWith('payment-123');
    });

    it('raises a 503 when the gateway accepts the request but reports the refund unsuccessful', async () => {
      vi.mocked(paymobGateway.refundTransaction).mockResolvedValue({
        refundId: 'rf-4',
        success: false,
        pending: false,
        isRefund: true,
        amountCents: 500,
        currency: 'EGP',
        raw: { id: 4, success: false },
      });

      const failure = await paymentsService.createRefund('payment-123', 500).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
      // A 2xx that reports `success: false` is a refusal, so the row must not say `processed`.
      expect(paymentsRepository.updateRefund).toHaveBeenLastCalledWith(
        'refund-123',
        expect.objectContaining({ status: 'failed' }),
      );
      expect(paymentsRepository.reconcileRefundCapacity).toHaveBeenCalledWith('payment-123');
    });

    it('keeps the gateway error in the refund metadata instead of the release reason', async () => {
      vi.mocked(paymobGateway.refundTransaction).mockRejectedValue(
        new PaymobGatewayError('refund', 'HTTP 422 Unprocessable Entity', new Error('rejected')),
      );

      await paymentsService.createRefund('payment-123', 500).catch(() => undefined);

      // The refund row is written once, with the diagnostic that explains the upstream failure.
      const [writes] = vi
        .mocked(paymentsRepository.updateRefund)
        .mock.calls.filter((call) => call[1] !== undefined && 'status' in (call[1] as { status?: string }));
      expect(writes?.[0]).toBe('refund-123');
      const metadata = JSON.parse(String((writes?.[1] as { metadata: string }).metadata)) as { error: string };
      expect(metadata.error).toContain('HTTP 422');
    });

    it('leaves the refund pending when the gateway says the refund is still pending', async () => {
      vi.mocked(paymobGateway.refundTransaction).mockResolvedValue({
        refundId: 'rf-1',
        success: false,
        pending: true,
        isRefund: true,
        amountCents: 500,
        currency: 'EGP',
        raw: { id: 1, pending: true },
      });

      const refund = await paymentsService.createRefund('payment-123', 500);

      expect(refund.status).toBe('pending');
      expect(refund.paymobRefundId).toBe('rf-1');
      // Pending upstream means the money may have moved: capacity stays reserved.
      expect(paymentsRepository.reconcileRefundCapacity).not.toHaveBeenCalled();
    });

    it('refuses a refund larger than the captured amount', async () => {
      vi.mocked(paymentsRepository.reserveRefundCapacity).mockRejectedValue(
        new RefundCapacityExceededError(5000, 0, 1000),
      );

      await expect(paymentsService.createRefund('payment-123', 5000)).rejects.toThrow(
        'Refund amount 5000 exceeds the captured amount 1000',
      );
      expect(paymobGateway.refundTransaction).not.toHaveBeenCalled();
    });

    it('refuses a non integer refund amount before opening a transaction', async () => {
      await expect(paymentsService.createRefund('payment-123', 10.5)).rejects.toThrow('Invalid payment amount');
      expect(paymentsRepository.reserveRefundCapacity).not.toHaveBeenCalled();
    });

    it('refuses a refund whose stored currency is null with a 400 instead of an untyped 500', async () => {
      // A legacy row written before `payments.currency` had a default can hold NULL. The old code
      // called `.toUpperCase()` on it, which raised a TypeError that Nest reports as 500.
      vi.mocked(paymentsRepository.findById).mockResolvedValue({
        ...completedPayment,
        currency: null as unknown as string,
      });

      const failure = await paymentsService.createRefund('payment-123', 500).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).getStatus()).toBe(400);
      expect((failure as BadRequestException).message).toMatch(/Invalid payment currency/);
      expect(paymentsRepository.reserveRefundCapacity).not.toHaveBeenCalled();
    });

    it('refuses an empty stored currency with the same 400', async () => {
      vi.mocked(paymentsRepository.findById).mockResolvedValue({ ...completedPayment, currency: '' });

      const failure = await paymentsService.createRefund('payment-123', 500).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).getStatus()).toBe(400);
    });
  });

  describe('validateWebhookSignature', () => {
    const sign = (rawBody: string, secret: string): string =>
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    it('should pass with valid signature', () => {
      const payload = { transaction_id: 'txn-123', status: 'success' };
      const secret = 'test-webhook-secret';
      const rawBody = JSON.stringify(payload);

      expect(() => paymentsService.validateWebhookSignature(rawBody, sign(rawBody, secret), secret)).not.toThrow();
    });

    it('should throw when signature is missing', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });

      expect(() => paymentsService.validateWebhookSignature(rawBody, undefined, 'secret')).toThrow(
        'Missing webhook signature',
      );
    });

    it('should throw when secret is not configured', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });

      expect(() => paymentsService.validateWebhookSignature(rawBody, 'sig', undefined)).toThrow(
        'Webhook secret is not configured',
      );
    });

    it('should throw when signature is invalid', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });

      expect(() => paymentsService.validateWebhookSignature(rawBody, 'invalid-signature', 'secret')).toThrow(
        'Invalid webhook signature',
      );
    });

    it('compares with timingSafeEqual rather than string inequality', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });
      const secret = 'test-webhook-secret';
      cryptoSpies.timingSafeEqual.mockClear();

      paymentsService.validateWebhookSignature(rawBody, sign(rawBody, secret), secret);

      // `signature !== expected` returns at the first differing byte, which leaks how much of a
      // forged signature was correct. The comparison has to be the constant-time primitive.
      expect(cryptoSpies.timingSafeEqual).toHaveBeenCalledTimes(1);
    });

    it('uses the constant-time comparison for a wrong-length signature too', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });
      const secret = 'test-webhook-secret';
      cryptoSpies.timingSafeEqual.mockClear();

      expect(() => paymentsService.validateWebhookSignature(rawBody, 'abcd', secret)).toThrow(
        'Invalid webhook signature',
      );

      // If the length mismatch short-circuited, this would be zero calls — and a length branch is
      // exactly the thing a timing oracle would key on.
      expect(cryptoSpies.timingSafeEqual).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong-length signature on the same path as a wrong-content one', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });
      const secret = 'test-webhook-secret';
      const valid = sign(rawBody, secret);

      // `timingSafeEqual` throws on a length mismatch, so the old shortcut of comparing buffers
      // directly would have turned a 16-character signature into a 500. Both must read the same.
      const short = valid.slice(0, 16);
      const long = `${valid}00`;

      const messageFor = (signature: string): string => {
        try {
          paymentsService.validateWebhookSignature(rawBody, signature, secret);
          return 'accepted';
        } catch (error) {
          return (error as Error).message;
        }
      };

      expect(messageFor(short)).toBe('Invalid webhook signature');
      expect(messageFor(long)).toBe('Invalid webhook signature');
      expect(messageFor(valid.replace(/^./, (c) => (c === '0' ? '1' : '0')))).toBe('Invalid webhook signature');
    });

    it('rejects a signature that is not hex at all without throwing', () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });

      // `Buffer.from(value, 'hex')` stops at the first invalid pair rather than throwing, so a
      // non-hex signature decodes to an empty buffer and has to be rejected, not crash.
      expect(() => paymentsService.validateWebhookSignature(rawBody, 'z'.repeat(64), 'secret')).toThrow(
        'Invalid webhook signature',
      );
      expect(() => paymentsService.validateWebhookSignature(rawBody, 'not-hex', 'secret')).toThrow(
        'Invalid webhook signature',
      );
    });
  });

  describe('handlePaymobWebhook', () => {
    const secret = WEBHOOK_SECRET;
    const sign = (rawBody: string): string => crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    it('completes the payment when the captured amount matches the recorded amount', async () => {
      const payload = {
        transaction_id: 'txn-123',
        order_id: 'order-123',
        status: 'success',
        payment_id: 'pay-123',
        amount_cents: 1000,
      };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'completed' });

      const result = await paymentsService.handlePaymobWebhook(rawBody, sign(rawBody));

      expect(result.status).toBe('processed');
      expect(paymentsRepository.update).toHaveBeenCalledWith(
        'payment-123',
        expect.objectContaining({ status: 'completed', paymobTransactionId: 'txn-123' }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('payment.completed', { paymentId: 'payment-123' });
    });

    it('completes the payment from the documented TRANSACTION envelope', async () => {
      const payload = {
        type: 'TRANSACTION',
        data: { id: 987654, amount_cents: 1000, success: true, pending: false, order: { id: 'order-123' } },
      };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'completed' });

      const result = await paymentsService.handlePaymobWebhook(rawBody, sign(rawBody));

      expect(result.status).toBe('processed');
      expect(paymentsRepository.update).toHaveBeenCalledWith(
        'payment-123',
        expect.objectContaining({ status: 'completed', paymobTransactionId: '987654' }),
      );
    });

    it('refuses to complete the payment when Paymob captured more than was ordered', async () => {
      const payload = {
        transaction_id: 'txn-123',
        order_id: 'order-123',
        status: 'success',
        amount_cents: 2500,
      };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);

      const failure = await paymentsService.handlePaymobWebhook(rawBody, sign(rawBody)).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).message).toBe(
        'Captured amount 2500 does not match the recorded amount 1000',
      );
      // The payment must be left exactly as it was: an unverifiable capture is not a capture.
      expect(paymentsRepository.update).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalledWith('payment.completed', expect.anything());
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Paymob captured 2500'));
    });

    it('refuses to complete the payment when Paymob captured less than was ordered', async () => {
      const payload = { transaction_id: 'txn-123', order_id: 'order-123', status: 'success', amount_cents: 400 };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);

      await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).rejects.toThrow(
        'Captured amount 400 does not match the recorded amount 1000',
      );
      expect(paymentsRepository.update).not.toHaveBeenCalled();
    });

    it('refuses a successful delivery that carries no amount at all', async () => {
      const payload = { transaction_id: 'txn-123', order_id: 'order-123', status: 'success' };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);

      // Marking a capture complete whose amount cannot be read is how an under-collected payment
      // silently becomes "paid". Better to reject and let Paymob retry.
      await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).rejects.toThrow(/carries no amount/);
      expect(paymentsRepository.update).not.toHaveBeenCalled();
    });

    it('still accepts a failure delivery that carries no amount', async () => {
      const payload = { transaction_id: 'txn-123', order_id: 'order-123', status: 'failed' };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'failed' });

      // Nothing was collected, so there is no amount to reconcile and refusing would strand the payment.
      const result = await paymentsService.handlePaymobWebhook(rawBody, sign(rawBody));

      expect(result.status).toBe('processed');
      expect(paymentsRepository.update).toHaveBeenCalledWith(
        'payment-123',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('does not treat a pending envelope as captured', async () => {
      const payload = {
        type: 'TRANSACTION',
        data: { id: 987654, amount_cents: 1000, success: true, pending: true, order: { id: 'order-123' } },
      };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'failed' });

      const result = await paymentsService.handlePaymobWebhook(rawBody, sign(rawBody));

      expect(result.status).toBe('processed');
      expect(paymentsRepository.update).toHaveBeenCalledWith(
        'payment-123',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('rejects a delivery with no transaction id', async () => {
      const rawBody = JSON.stringify({ order_id: 'order-123', status: 'success', amount_cents: 1000 });

      await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).rejects.toThrow(
        'Missing transaction_id in webhook payload',
      );
    });

    it('rejects a delivery with no order id', async () => {
      // Falling through to `findByOrderId(undefined)` would build a query against a null order id and
      // silently match nothing, which surfaces as a confusing 404.
      const rawBody = JSON.stringify({ transaction_id: 'txn-123', status: 'success', amount_cents: 1000 });

      await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).rejects.toThrow(
        'Missing order_id in webhook payload',
      );
      expect(paymentsRepository.findByOrderId).not.toHaveBeenCalled();
    });

    it('rejects a malformed body', async () => {
      const rawBody = 'not json';

      await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).rejects.toThrow(
        'Invalid webhook payload',
      );
    });

    it('rejects a body whose amount is not a number', async () => {
      const rawBody = JSON.stringify({
        transaction_id: 'txn-123',
        order_id: 'order-123',
        status: 'success',
        amount_cents: '1000',
      });

      await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).rejects.toThrow(
        'Invalid webhook payload',
      );
    });

    it('should reject webhook with invalid signature', async () => {
      const rawBody = JSON.stringify({ transaction_id: 'txn-123' });

      await expect(paymentsService.handlePaymobWebhook(rawBody, 'invalid-signature')).rejects.toThrow(
        'Invalid webhook signature',
      );
    });

    it('should return already_processed for duplicate transaction', async () => {
      const payload = {
        transaction_id: 'txn-123',
        order_id: 'order-123',
        status: 'success',
        amount_cents: 1000,
      };
      const rawBody = JSON.stringify(payload);

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue({ ...mockPayment, status: 'completed' });

      const result = await paymentsService.handlePaymobWebhook(rawBody, sign(rawBody));

      expect(result.status).toBe('already_processed');
    });

    it('signs with the configured webhook secret and ignores process.env', async () => {
      const rawBody = JSON.stringify({
        transaction_id: 'txn-123',
        order_id: 'order-123',
        status: 'success',
        amount_cents: 1000,
      });

      vi.mocked(paymentsRepository.findByTransactionId).mockResolvedValue(null);
      vi.mocked(paymentsRepository.findByOrderId).mockResolvedValue(mockPayment);
      vi.mocked(paymentsRepository.update).mockResolvedValue({ ...mockPayment, status: 'completed' });

      // A stale or injected process.env value must neither be able to sign a delivery the config
      // does not accept, nor be consulted at all: the secret is resolved once, by the config schema.
      const previous = process.env.PAYMOB_WEBHOOK_SECRET;
      process.env.PAYMOB_WEBHOOK_SECRET = 'some-other-secret-from-the-environment';
      const envSignature = crypto
        .createHmac('sha256', 'some-other-secret-from-the-environment')
        .update(rawBody)
        .digest('hex');
      try {
        await expect(paymentsService.handlePaymobWebhook(rawBody, envSignature)).rejects.toThrow(
          'Invalid webhook signature',
        );

        await expect(paymentsService.handlePaymobWebhook(rawBody, sign(rawBody))).resolves.toEqual({
          status: 'processed',
        });
      } finally {
        if (previous === undefined) {
          delete process.env.PAYMOB_WEBHOOK_SECRET;
        } else {
          process.env.PAYMOB_WEBHOOK_SECRET = previous;
        }
      }
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
      expect(result[0].createdAt).toBe(mockRefunds[0]?.createdAt.toISOString());
      expect(paymentsRepository.findRefundsByPayment).toHaveBeenCalledWith('payment-123');
    });
  });
});
