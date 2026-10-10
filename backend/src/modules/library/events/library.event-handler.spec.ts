import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { Payment } from '../../payments/interfaces/payments-repository.interface.ts';

import { LibraryEventHandler } from './library.event-handler.ts';
import type { ILibraryRepository } from '../interfaces/library-repository.interface.ts';
import type { IPaymentsRepository } from '../../payments/interfaces/payments-repository.interface.ts';

/**
 * The commercial flow did not exist.
 *
 * `PaymentsEventHandler.handlePaymentCompleted` logged a line and returned, so a completed payment
 * produced a `payments` row and nothing else: no library entry, no ownership. The user was charged and
 * given nothing, and the only way to end up owning a book was `POST /library` — which any
 * authenticated account could POST for ANY book in the catalogue, free. The hole and the defect were
 * the same hole seen from two ends.
 *
 * These cases pin the grant, and pin the two things that made it unsafe to add blindly: it must be
 * idempotent (a gateway webhook can be delivered twice) and it must derive the book from the STORED
 * payment rather than from the event.
 */
const paymentFor = (metadata: Record<string, unknown> | null, overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'pay-1',
    userId: 'user-1',
    amount: 5000,
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

const item = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'lib-1',
    userId: 'user-1',
    bookId: 'book-1',
    rentalId: null,
    status: 'owned',
    addedAt: new Date('2026-01-01'),
    lastAccessedAt: null,
    ...overrides,
  }) as never;

describe('LibraryEventHandler.handlePaymentCompleted (the entitlement)', () => {
  let handler: LibraryEventHandler;
  let library: {
    findByUserAndBook: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let payments: { findById: ReturnType<typeof vi.fn> };
  let eventBus: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    library = {
      findByUserAndBook: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(item()),
    };
    payments = { findById: vi.fn() };
    eventBus = { emit: vi.fn() };

    handler = new LibraryEventHandler(
      library as unknown as ILibraryRepository,
      payments as unknown as IPaymentsRepository,
      eventBus as unknown as EventValidatorService,
      {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
      } as unknown as WinstonLoggerService,
    );
  });

  it('GRANTS OWNERSHIP for a completed purchase — the entitlement that never happened', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));

    await handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never);

    expect(library.create).toHaveBeenCalledWith({
      userId: 'user-1',
      bookId: 'book-1',
      status: 'owned',
    });
  });

  it('announces the item so other subscribers learn about it', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));

    await handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never);

    expect(eventBus.emit).toHaveBeenCalledWith('library.item.added', {
      libraryItemId: 'lib-1',
      userId: 'user-1',
      bookId: 'book-1',
    });
  });

  it('reads the book from the STORED payment, not from the event', async () => {
    // `PaymentCompletedEvent` carries only `paymentId`. Deriving the entitlement from the stored row
    // is what makes it the authoritative record of what was paid for.
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));

    await handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never);

    expect(payments.findById).toHaveBeenCalledWith('pay-1');
    expect(library.create).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1' }));
  });

  it('is idempotent: a second webhook delivery grants nothing further', async () => {
    // Gateways redeliver. Without this the second delivery is a `library_pkey` violation surfacing as
    // a 500 in the webhook handler — a payment the customer already paid for would look failed.
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));
    library.findByUserAndBook.mockResolvedValue(item());

    await handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never);

    expect(library.create).not.toHaveBeenCalled();
  });

  it('grants nothing for a payment with no book behind it', async () => {
    // A subscription or any future one-off charge has no book, and inventing an entitlement for an
    // unknown type would be worse than granting none.
    payments.findById.mockResolvedValue(paymentFor({ type: 'subscription' }));

    await handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never);

    expect(library.create).not.toHaveBeenCalled();
  });

  it('grants nothing for a rental payment — the rentals module owns that one', async () => {
    // Both handlers subscribe to `payment.completed`; each filters on the metadata it owns, so
    // neither has to know the other exists.
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'rental', durationDays: 14 }));

    await handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never);

    expect(library.create).not.toHaveBeenCalled();
  });

  it('survives unparseable metadata instead of stranding the payment', async () => {
    // The money is confirmed by the gateway. A bad JSON blob must not leave the payment completed and
    // the entitlement permanently absent — an operator reconciles that; a thrown error here would not
    // be retried by anything.
    payments.findById.mockResolvedValue(paymentFor(null));
    payments.findById.mockResolvedValue({ ...paymentFor(null), metadata: '{not json' } as never);

    await expect(handler.handlePaymentCompleted({ paymentId: 'pay-1' } as never)).resolves.toBeUndefined();
    expect(library.create).not.toHaveBeenCalled();
  });
});
