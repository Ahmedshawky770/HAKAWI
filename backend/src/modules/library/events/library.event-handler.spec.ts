import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { Payment } from '../../payments/interfaces/payments-repository.interface.ts';
import type { ILibraryRepository } from '../interfaces/library-repository.interface.ts';
import type { IPaymentsRepository } from '../../payments/interfaces/payments-repository.interface.ts';
import type { LibraryService } from '../library.service.ts';

import { LibraryEventHandler } from './library.event-handler.ts';

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
    findByRentalId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let payments: { findById: ReturnType<typeof vi.fn> };
  let eventBus: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    library = {
      findByUserAndBook: vi.fn().mockResolvedValue(null),
      findByRentalId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(item()),
      delete: vi.fn(),
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
      { removeBookForRefund: vi.fn().mockResolvedValue(true) } as unknown as LibraryService,
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

/**
 * A rental the reader paid for had to reach the shelf.
 *
 * `RentalsEventHandler` writes the rental when the payment completes, but nothing joined that rental
 * to a `library` row, so a book rented for money never appeared on the shelf and the download path
 * had no row to find. These cases pin the grant, its two idempotency guards, and the withdrawal that
 * ends access when the rental does.
 */
describe('LibraryEventHandler rental access', () => {
  let handler: LibraryEventHandler;
  let library: {
    findByUserAndBook: ReturnType<typeof vi.fn>;
    findByRentalId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let payments: { findById: ReturnType<typeof vi.fn> };
  let eventBus: { emit: ReturnType<typeof vi.fn> };
  let libraryService: {
    addToLibrary: ReturnType<typeof vi.fn>;
    removeBookForRefund: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    library = {
      findByUserAndBook: vi.fn().mockResolvedValue(null),
      findByRentalId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(item({ id: 'lib-7', status: 'rented', rentalId: 'rental-1' })),
      delete: vi.fn(),
    };
    payments = { findById: vi.fn() };
    eventBus = { emit: vi.fn() };
    libraryService = {
      addToLibrary: vi.fn().mockResolvedValue(item({ id: 'lib-7', status: 'rented', rentalId: 'rental-1' })),
      removeBookForRefund: vi.fn().mockResolvedValue(true),
    };

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
      libraryService as unknown as LibraryService,
    );
  });

  it('puts a paid rental on the shelf as rented access, tied to the rental', async () => {
    await handler.handleRentalCreated({ rentalId: 'rental-1', userId: 'user-1', bookId: 'book-1' } as never);

    // The grant goes through `LibraryService.addToLibrary` — the same path a purchase grant and a
    // reader-initiated add use — so the write and its `library.item.added` announcement have one
    // implementation. This handler's job is the two guards above it, not a second copy of the grant.
    expect(libraryService.addToLibrary).toHaveBeenCalledWith('user-1', {
      bookId: 'book-1',
      rentalId: 'rental-1',
    });
    expect(library.create).not.toHaveBeenCalled();
  });

  it('is idempotent for a replayed rental.created', async () => {
    library.findByRentalId.mockResolvedValue(item({ status: 'rented', rentalId: 'rental-1' }));

    await handler.handleRentalCreated({ rentalId: 'rental-1', userId: 'user-1', bookId: 'book-1' } as never);

    expect(libraryService.addToLibrary).not.toHaveBeenCalled();
  });

  it('never demotes an owned book into a rental that will expire', async () => {
    library.findByUserAndBook.mockResolvedValue(item({ status: 'owned' }));

    await handler.handleRentalCreated({ rentalId: 'rental-1', userId: 'user-1', bookId: 'book-1' } as never);

    expect(libraryService.addToLibrary).not.toHaveBeenCalled();
  });

  it('keeps the existing entry when the shelf race is lost to the service', async () => {
    // The two guards cannot see a concurrent grant; the service's own check throws instead, and a
    // replayed event must be a log line rather than a 500 inside the handler.
    libraryService.addToLibrary.mockRejectedValue(new ConflictException('Book already in library'));

    await expect(
      handler.handleRentalCreated({ rentalId: 'rental-1', userId: 'user-1', bookId: 'book-1' } as never),
    ).resolves.toBeUndefined();
  });

  it('withdraws the shelf entry when the rental is returned', async () => {
    library.findByRentalId.mockResolvedValue(item({ id: 'lib-7', status: 'rented', rentalId: 'rental-1' }));

    await handler.handleRentalReturned({ rentalId: 'rental-1' } as never);

    // The removal goes through `LibraryService`, which owns the delete, the `library:<id>` cache-key
    // invalidation and the `library.item.removed` announcement — the three side effects a direct
    // `libraryRepository.delete` used to miss. This handler's job ends at asking for the revocation
    // of the right (user, book) pair; what the service does with it is asserted in library.service.spec.
    expect(libraryService.removeBookForRefund).toHaveBeenCalledWith('user-1', 'book-1');
    expect(library.delete).not.toHaveBeenCalled();
  });

  it('withdraws the shelf entry when the rental lapses, the same way', async () => {
    library.findByRentalId.mockResolvedValue(item({ id: 'lib-7', status: 'rented', rentalId: 'rental-1' }));

    await handler.handleRentalExpired({ rentalId: 'rental-1' } as never);

    // Same revocation path as a return — a lapsed rental and a refunded one are the same fact to the
    // shelf, so they must not have two code paths.
    expect(libraryService.removeBookForRefund).toHaveBeenCalledWith('user-1', 'book-1');
  });

  it('tolerates an ended rental that never reached the shelf', async () => {
    library.findByRentalId.mockResolvedValue(null);

    await expect(handler.handleRentalExpired({ rentalId: 'rental-1' } as never)).resolves.toBeUndefined();
    expect(library.delete).not.toHaveBeenCalled();
  });
});

/**
 * A refund revokes the entitlement it paid for.
 *
 * `PaymentsService` emits `refund.completed` when the gateway returns the money. Before this handler
 * existed the name was registered and subscribed but never emitted and never acted on, so a refunded
 * purchase left the reader a permanent owner of a book nobody was paying for. These cases pin the
 * revocation, that it targets the STORED payment's book and owner, that it is filtered to purchases
 * only (a rental refund is the rentals module's fact), and that an already-absent entitlement is a
 * no-op rather than a 500.
 */
describe('LibraryEventHandler.handleRefundCompleted (the revocation)', () => {
  let handler: LibraryEventHandler;
  let payments: { findById: ReturnType<typeof vi.fn> };
  let libraryService: { removeBookForRefund: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    payments = { findById: vi.fn() };
    libraryService = { removeBookForRefund: vi.fn().mockResolvedValue(true) };

    handler = new LibraryEventHandler(
      { findByUserAndBook: vi.fn(), delete: vi.fn() } as unknown as ILibraryRepository,
      payments as unknown as IPaymentsRepository,
      { emit: vi.fn() } as unknown as EventValidatorService,
      {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
      } as unknown as WinstonLoggerService,
      libraryService as unknown as LibraryService,
    );
  });

  it('revokes the purchased book the STORED payment names, for its owner', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(payments.findById).toHaveBeenCalledWith('pay-1');
    expect(libraryService.removeBookForRefund).toHaveBeenCalledWith('user-1', 'book-1');
  });

  it('treats an already-absent entitlement as a no-op, not a 500', async () => {
    // Removing what is not there returns `false` from the service; the listener resolves rather than
    // throwing, so a replayed gateway delivery cannot fail (Principle #16).
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'purchase' }));
    libraryService.removeBookForRefund.mockResolvedValue(false);

    await expect(
      handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never),
    ).resolves.toBeUndefined();
    expect(libraryService.removeBookForRefund).toHaveBeenCalledWith('user-1', 'book-1');
  });

  it('never touches a rental refund — the rentals module owns that one', async () => {
    payments.findById.mockResolvedValue(paymentFor({ bookId: 'book-1', type: 'rental', durationDays: 14 }));

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(libraryService.removeBookForRefund).not.toHaveBeenCalled();
  });

  it('revokes nothing for a purchase payment that cannot name its book', async () => {
    payments.findById.mockResolvedValue(paymentFor({ type: 'purchase' }));

    await handler.handleRefundCompleted({ paymentId: 'pay-1', refundId: 'refund-1' } as never);

    expect(libraryService.removeBookForRefund).not.toHaveBeenCalled();
  });
});
