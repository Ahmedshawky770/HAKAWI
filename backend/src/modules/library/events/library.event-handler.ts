import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  LibraryItemAddedEvent,
  LibraryItemAccessedEvent,
  LibraryItemRemovedEvent,
} from '../../../common/events/library.events.ts';
import type { PaymentCompletedEvent } from '../../../common/events/payments.events.ts';
import type { ILibraryRepository } from '../interfaces/library-repository.interface.ts';
import { LIBRARY_REPOSITORY } from '../interfaces/library-repository.interface.ts';
import type { IPaymentsRepository } from '../../payments/interfaces/payments-repository.interface.ts';
import { PAYMENTS_REPOSITORY } from '../../payments/interfaces/payments-repository.interface.ts';

@Injectable()
export class LibraryEventHandler {
  constructor(
    @Inject(LIBRARY_REPOSITORY) private readonly libraryRepository: ILibraryRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepository: IPaymentsRepository,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('library.item.added')
  async handleLibraryItemAdded(event: LibraryItemAddedEvent): Promise<void> {
    this.logger.info(`Handling library item added event: ${event.libraryItemId}`, 'LibraryEventHandler');
  }

  @OnEvent('library.item.accessed')
  async handleLibraryItemAccessed(event: LibraryItemAccessedEvent): Promise<void> {
    this.logger.info(`Handling library item accessed event: ${event.libraryItemId}`, 'LibraryEventHandler');
  }

  @OnEvent('library.item.removed')
  async handleLibraryItemRemoved(event: LibraryItemRemovedEvent): Promise<void> {
    this.logger.info(`Handling library item removed event: ${event.libraryItemId}`, 'LibraryEventHandler');
  }

  /**
   * THE ENTITLEMENT. This is the whole commercial flow, and it did not exist.
   *
   * `PaymentsEventHandler.handlePaymentCompleted` logged a line and returned, so a completed payment
   * produced a `payments` row and nothing else: no library entry, no rental activation. The user was
   * charged and given nothing, and the only way to end up owning a book was to POST `/library`
   * directly — which any authenticated account could do for ANY book in the catalogue, free.
   *
   * WHY IT LIVES HERE AND NOT IN THE PAYMENTS MODULE. "This user owns this book" is the library's
   * fact, and Principle #9 puts one authoritative source behind it. Putting the write in the payments
   * module would mean the payments module knows what a library row is; putting it here means the
   * library module is the only thing that can grant or revoke an entitlement.
   *
   * WHY THE PAYMENT IS READ BACK RATHER THAN CARRIED ON THE EVENT. `PaymentCompletedEvent` carries only
   * `paymentId`, and widening it would mean every publisher of the event had to know what an
   * entitlement is. Reading the row through `IPaymentsRepository` — the payments module's own
   * interface, which `PaymentsModule` now exports for exactly this — keeps the coupling at one
   * documented edge (Principle #7) and means the grant is derived from the STORED payment, which is
   * the authoritative record of what was paid for.
   *
   * WHY IT IS IDEMPOTENT. A gateway webhook can be delivered more than once; `paymob_transaction_id`
   * carries a unique index, but that guards the payment row, not this one. `findByUserAndBook` plus
   * the `library`'s own uniqueness is what makes a duplicate delivery a no-op rather than a
   * `library_pkey` violation that would surface as a 500 in the webhook handler.
   */
  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    const payment = await this.paymentsRepository.findById(event.paymentId);
    if (!payment) {
      // Not reachable through the event bus in practice — the publisher holds the id — but a missing
      // row here must not be a silent grant or a silent skip.
      throw new NotFoundException(`Payment ${event.paymentId} not found while granting entitlement`);
    }

    const meta = this.parseMetadata(payment.metadata);

    // ONLY a purchase grants ownership. `RentalsEventHandler` subscribes to the same event for
    // `rental` and `rental_extension`, and without this filter a paid rental would ALSO write an
    // `owned` library row — turning a 14-day rental into permanent ownership of a paid book.
    //
    // A subscription, a future one-off charge, and anything whose type this module does not own are
    // all declined here. Granting an entitlement for a type nobody reasoned about is worse than
    // granting none.
    if (meta.type !== 'purchase') {
      this.logger.info(
        `Completed payment ${payment.id} is a ${String(meta.type ?? 'untyped')} payment, not a purchase; no entitlement granted`,
        'LibraryEventHandler',
      );
      return;
    }

    const bookId = typeof meta.bookId === 'string' ? meta.bookId : null;
    if (!bookId) {
      // A purchase whose metadata cannot say which book is un-grantable. The money is confirmed, so
      // an operator has to reconcile it — but inventing a bookId here would hand out a random book.
      this.logger.error(
        `Purchase payment ${payment.id} has no usable bookId metadata; no entitlement granted`,
        'LibraryEventHandler',
      );
      return;
    }

    const existing = await this.libraryRepository.findByUserAndBook(payment.userId, bookId);
    if (existing) {
      this.logger.info(
        `User ${payment.userId} already has book ${bookId} in the library; payment ${payment.id} grants nothing further`,
        'LibraryEventHandler',
      );
      return;
    }

    // A paid purchase supersedes an active rental of the same book: the user has bought it outright,
    // and the rental row is left alone because it still governs access expiry independently.
    const item = await this.libraryRepository.create({
      userId: payment.userId,
      bookId,
      status: 'owned',
    });

    this.logger.info(
      `Granted ownership of book ${bookId} to user ${payment.userId} for payment ${payment.id}`,
      'LibraryEventHandler',
    );

    await this.eventBus.emit('library.item.added', {
      libraryItemId: item.id,
      userId: payment.userId,
      bookId,
    } as LibraryItemAddedEvent);
  }

  /**
   * `payments.metadata` is `text` holding whatever the caller passed to `paymobInitializePayment`,
   * JSON-encoded. It is parsed defensively because a malformed value must not throw inside an event
   * handler and strand the payment: a payment the gateway confirmed must not become permanently
   * un-grantable because of a bad JSON blob.
   */
  private parseMetadata(raw: string | null): Record<string, unknown> {
    if (!raw) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch (error) {
      this.logger.error(
        `Payment metadata is not valid JSON; treating it as empty: ${error instanceof Error ? error.message : String(error)}`,
        'LibraryEventHandler',
      );
      return {};
    }
  }
}
