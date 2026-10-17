import { ConflictException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  LibraryItemAddedEvent,
  LibraryItemAccessedEvent,
  LibraryItemRemovedEvent,
} from '../../../common/events/library.events.ts';
import type { PaymentCompletedEvent, RefundCompletedEvent } from '../../../common/events/payments.events.ts';
import type {
  RentalCreatedEvent,
  RentalReturnedEvent,
  RentalExpiredEvent,
} from '../../../common/events/rentals.events.ts';
import { LibraryService } from '../library.service.ts';
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
    // Reused only to revoke a purchase entitlement on a refund, through the same removal path a
    // reader-initiated DELETE uses. Injected rather than re-implemented so the vault-key delete and
    // the `library.item.removed` announcement stay in the one place that owns them (Principle #9).
    @Inject(LibraryService) private readonly libraryService: LibraryService,
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
   * A settled refund revokes the purchased entitlement.
   *
   * WHY THIS EXISTS. `PaymentsService` emits `refund.completed` when the gateway returns the money.
   * That name was registered in the schema and even subscribed, but no producer ever emitted it and
   * nothing acted on it — so a refunded purchase left the reader a permanent owner of a book the
   * merchant had paid back: a book nobody was paying for, delivered forever. Removing the library
   * entry is the revocation, and it is the whole of it — the download path consults this table, so
   * once the entry is gone the only way the reader has the file again is by buying it again.
   *
   * WHY IT LIVES HERE. "This user owns this book" is the library's fact (Principle #9), so the
   * entitlement is revoked by the library module and not by the payments module reaching into a
   * library table it does not own (Principle #7). The payment is read back for its stored `userId`
   * and `metadata`, exactly as the grant path does, so the revocation targets the same
   * `(userId, bookId)` the grant created and is derived from the authoritative record of the sale
   * rather than from the event payload.
   *
   * WHY IT IS IDEMPOTENT (Principle #16). A gateway delivery can be replayed or duplicated. Removal
   * goes through `LibraryService.removeBookForRefund`, which treats an already-absent entitlement as
   * a no-op rather than a `NotFoundException`/500, so a second delivery cannot fail the listener or
   * disturb a reader who had already lost the book.
   *
   * ONLY a purchase is revoked here. A rental refund is the rentals module's fact — it subscribes to
   * the same event and expires the rental — and a rental's `rented` shelf entry is then withdrawn by
   * the existing `rental.expired`/`rental.returned` consumers. Filtering on `purchase` is what keeps
   * this handler from ever deleting a rental the reader still paid for.
   */
  @OnEvent('refund.completed')
  async handleRefundCompleted(event: RefundCompletedEvent): Promise<void> {
    const payment = await this.paymentsRepository.findById(event.paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${event.paymentId} not found while revoking an entitlement`);
    }

    const meta = this.parseMetadata(payment.metadata);
    if (meta.type !== 'purchase') {
      // A rental refund is revoked by the rentals module; anything this module does not own is
      // declined rather than guessed at, and the money-side consumer runs independently.
      return;
    }

    const bookId = typeof meta.bookId === 'string' ? meta.bookId : null;
    if (!bookId) {
      this.logger.error(
        `Purchase refund ${event.refundId} names payment ${payment.id} with no usable bookId metadata; no entitlement revoked`,
        'LibraryEventHandler',
      );
      return;
    }

    const removed = await this.libraryService.removeBookForRefund(payment.userId, bookId);
    if (removed) {
      this.logger.info(
        `Revoked ownership of book ${bookId} from user ${payment.userId} because refund ${event.refundId} settled`,
        'LibraryEventHandler',
      );
    } else {
      // The entitlement was already gone, or a purchase whose entitlement never materialised. Not an
      // error: the refund still settled, and re-removing nothing is the correct outcome.
      this.logger.warn(
        `Purchase refund ${event.refundId} found no library entry for user ${payment.userId} on book ${bookId}; nothing to revoke`,
        'LibraryEventHandler',
      );
    }
  }

  /**
   * A paid rental becomes library access.
   *
   * THE ROW THIS WRITES IS THE READER'S ONLY PROOF OF THE RENTAL. `RentalsEventHandler` records the
   * rental itself when the payment completes, but nothing connected that rental to this table, so a
   * book paid for by the day was never on the shelf — the reader could not see it, and the access
   * check in the books module, which grants the file on a library row or a live rental, had nothing
   * in this table to find. `status: 'rented'` is the vocabulary the column has always carried and
   * the client's `LibraryItem` schema already parses.
   *
   * WHY THE TWO GUARDS. The handler is reachable again from a replayed or duplicated event, and the
   * `library`'s uniqueness is on the id, not on the pair: so this rental is checked for an entry of
   * its own, and the book for an entry the reader already has. A reader who owns the book outright
   * must not have that ownership demoted into a rental that expires in a fortnight.
   */
  @OnEvent('rental.created')
  async handleRentalCreated(event: RentalCreatedEvent): Promise<void> {
    this.logger.info(`Handling rental created event: ${event.rentalId}`, 'LibraryEventHandler');

    const existingForRental = await this.libraryRepository.findByRentalId(event.rentalId);
    if (existingForRental) {
      this.logger.info(`Rental ${event.rentalId} is already on the shelf; nothing to grant`);
      return;
    }

    const existingForBook = await this.libraryRepository.findByUserAndBook(event.userId, event.bookId);
    if (existingForBook) {
      this.logger.warn(
        `Rental ${event.rentalId} found the reader already holding book ${event.bookId} on the shelf; keeping the existing entry`,
      );
      return;
    }

    // The grant itself goes through the service, the same one the purchase grant and a
    // reader-initiated add use. This used to create the row and emit `library.item.added` by hand,
    // a second copy of the grant sequence that would silently miss any step later added to
    // `addToLibrary`. The two guards above are not redundant with the service's own existence
    // check: they answer this handler's two questions first — "is this rental already on the
    // shelf" and "does the reader already hold this book" — so a replayed or duplicated rental is
    // a log line rather than an exception, and the ConflictException below only covers the race
    // they cannot see.
    try {
      await this.libraryService.addToLibrary(event.userId, {
        bookId: event.bookId,
        rentalId: event.rentalId,
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn(
          `Rental ${event.rentalId} lost the shelf race for book ${event.bookId}; keeping the existing entry`,
        );
        return;
      }
      throw error;
    }

    this.logger.info(
      `Granted rented access to book ${event.bookId} for user ${event.userId} from rental ${event.rentalId}`,
    );
  }

  /**
   * A rental that ended stops being library access.
   *
   * The two endings share one withdrawal because they mean the same thing to the shelf: the rental
   * is no longer the reader's entitlement. Keeping the row would leave the shelf claiming access for
   * a book the reader handed back or let lapse, and the download path would have honoured it.
   */
  @OnEvent('rental.returned')
  async handleRentalReturned(event: RentalReturnedEvent): Promise<void> {
    await this.withdrawRentalAccess(event.rentalId, 'returned');
  }

  /** See {@link handleRentalReturned} — a lapsed rental ends the access it granted exactly the same way. */
  @OnEvent('rental.expired')
  async handleRentalExpired(event: RentalExpiredEvent): Promise<void> {
    await this.withdrawRentalAccess(event.rentalId, 'expired');
  }

  /**
   * Takes back the entry a rental granted, found by the rental's own id.
   *
   * A missing entry is logged rather than thrown: the rental ended, which is the fact that matters,
   * and a 500 inside the handler would leave the listener believing the withdrawal failed.
   */
  private async withdrawRentalAccess(rentalId: string, reason: string): Promise<void> {
    this.logger.info(`Handling rental ${reason} event: ${rentalId}`, 'LibraryEventHandler');

    const granted = await this.libraryRepository.findByRentalId(rentalId);
    if (!granted) {
      this.logger.warn(`Rental ${rentalId} ${reason} but has no library entry to withdraw`);
      return;
    }

    // WHY THROUGH THE SERVICE AND NOT A DIRECT DELETE. This used to re-implement the removal —
    // `libraryRepository.delete` plus a hand-rolled `library.item.removed` emit — and the copy
    // drifted from the original on its first side effect: `LibraryService.removeFromLibrary` also
    // deletes the `library:<id>` cache key, so a withdrawn rental entry could keep being served from
    // cache. The refund consumer in this same file already goes through the service; a returned or
    // lapsed rental is the same revocation with a different cause and must not have a second code
    // path (Principle #9).
    const withdrawn = await this.libraryService.removeBookForRefund(granted.userId, granted.bookId);
    if (!withdrawn) {
      // The entry disappeared between the lookup and the removal: the entitlement is gone either
      // way, which is the same no-op a replayed delivery must be.
      this.logger.info(`Rental ${rentalId} ${reason}; its library entry was already withdrawn`);
      return;
    }

    // `library.item.removed` is emitted by `removeFromLibrary` inside that call — one announcement
    // per removal, from the module that owns it.
    this.logger.info(`Withdrew rented access for rental ${rentalId} (library item ${granted.id})`);
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
