import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../../shared/cache/tagged-cache.service.ts';
import type { Payment } from '../../payments/interfaces/payments-repository.interface.ts';
import type { Rental } from '../interfaces/rentals-repository.interface.ts';
import { RENTAL_CACHE_NAMESPACE, RENTALS_CACHE_TAG } from '../rentals.service.ts';

import { RentalsEventHandler } from './rentals.event-handler.ts';

/**
 * A refund revokes the rental it paid for.
 *
 * `PaymentsService` emits `refund.completed` the moment the gateway returns the money. Before this
 * handler existed the name was registered in the schema and even carried an `@OnEvent` consumer,
 * but no producer ever emitted it and the consumer only logged — so a refunded rental stayed
 * `active` and the reader kept reading a book the merchant had already paid back.
 *
 * These cases pin the expiry, that it targets the STORED payment's book and owner, that a rental
 * refund alone touches the rental (a purchase refund is the library module's fact), that a
 * `rental_extension` refund is deliberately left to an operator, and that an already-ended rental
 * makes a replayed delivery a no-op rather than a 500 (Principle #16).
 */
const paymentFor = (metadata: Record<string, unknown> | null, overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'pay-1',
    userId: 'user-1',
    amount: 1500,
    currency: 'EGP',
    status: 'completed',
    paymentMethod: 'paymob',
    paymobOrderId: 'order-1',
    paymobPaymentId: null,
    paymobTransactionId: 'txn-1',
    metadata: metadata === null ? null : JSON.stringify(metadata),
    description: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as Payment;

const rentalFor = (overrides: Partial<Rental> = {}): Rental =>
  ({
    id: 'rental-1',
    userId: 'user-1',
    bookId: 'book-1',
    status: 'active',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-15'),
    extendedCount: 0,
    maxExtensions: 3,
    returnedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as Rental;

describe('RentalsEventHandler.handleRefundCompleted (the revocation)', () => {
  let handler: RentalsEventHandler;
  let rentals: { findByUserAndBook: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let payments: { findById: ReturnType<typeof vi.fn> };
  let eventBus: { emit: ReturnType<typeof vi.fn> };
  let cache: { invalidateKey: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rentals = { findByUserAndBook: vi.fn(), update: vi.fn() };
    payments = { findById: vi.fn() };
    eventBus = { emit: vi.fn() };
    cache = { invalidateKey: vi.fn().mockResolvedValue(undefined) };

    handler = new RentalsEventHandler(
      rentals as never,
      payments as never,
      eventBus as unknown as EventValidatorService,
      {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
      } as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
    );
  });

  it('expires the rental the STORED payment names and announces its expiry', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'rental', durationDays: 14 }));
    rentals.findByUserAndBook.mockResolvedValue(rentalFor());

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(payments.findById).toHaveBeenCalledWith('pay-1');
    expect(rentals.findByUserAndBook).toHaveBeenCalledWith('user-1', 'book-1');
    expect(rentals.update).toHaveBeenCalledWith('rental-1', { status: 'expired' });
    expect(cache.invalidateKey).toHaveBeenCalledWith(RENTAL_CACHE_NAMESPACE, 'rental-1', [RENTALS_CACHE_TAG]);
    expect(eventBus.emit).toHaveBeenCalledWith('rental.expired', { rentalId: 'rental-1' });
  });

  it('treats an already-expired rental as a replayed revocation, not a fresh write', async () => {
    // A gateway can deliver refund.completed twice; the second delivery must be a no-op, not a
    // re-expiry or a throw (Principle #16).
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'rental', durationDays: 14 }));
    rentals.findByUserAndBook.mockResolvedValue(rentalFor({ status: 'expired' }));

    await expect(
      handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never),
    ).resolves.toBeUndefined();
    expect(rentals.update).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalledWith('rental.expired', expect.any(Object));
  });

  it('leaves a already-returned rental alone', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'rental', durationDays: 14 }));
    rentals.findByUserAndBook.mockResolvedValue(rentalFor({ status: 'returned' }));

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(rentals.update).not.toHaveBeenCalled();
  });

  it('never touches a purchase refund — the library module owns that one', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(rentals.findByUserAndBook).not.toHaveBeenCalled();
    expect(rentals.update).not.toHaveBeenCalled();
  });

  it('does not auto-revert a rental_extension refund, but leaves the base rental intact', async () => {
    // Reverting an extension would restore a prior end date and undo an increment another payment
    // made — a multi-source reconciliation this handler must not do. It is logged; the base rental
    // stands, because refunding an extension does not refund the original rental.
    payments.findById.mockResolvedValue(
      paymentFor({ bookId: 'book-1', type: 'rental_extension', extensionDays: 7, rentalId: 'rental-1' }),
    );

    await expect(
      handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never),
    ).resolves.toBeUndefined();
    expect(rentals.update).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalledWith('rental.expired', expect.any(Object));
  });

  it('tolerates a refund with no rental to expire, without throwing', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'rental', durationDays: 14 }));
    rentals.findByUserAndBook.mockResolvedValue(null);

    await expect(
      handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never),
    ).resolves.toBeUndefined();
    expect(rentals.update).not.toHaveBeenCalled();
  });

  it('revokes nothing for a rental refund that cannot name its book', async () => {
    payments.findById.mockResolvedValue(paymentFor({ type: 'rental', durationDays: 14 }));

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(rentals.update).not.toHaveBeenCalled();
  });
});
