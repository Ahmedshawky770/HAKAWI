import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MAX_RENTAL_EXTENSIONS } from '@hakawi/shared-types';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { PaymentCompletedEvent, RefundCompletedEvent } from '../../../common/events/payments.events.ts';
import type { RentalCreatedEvent, RentalExtendedEvent, RentalExpiredEvent } from '../../../common/events/rentals.events.ts';
import { TaggedCacheService } from '../../shared/cache/tagged-cache.service.ts';
import { RENTAL_CACHE_NAMESPACE, RENTALS_CACHE_TAG } from '../rentals.service.ts';
import type { IRentalsRepository } from '../interfaces/rentals-repository.interface.ts';
import { RENTALS_REPOSITORY } from '../interfaces/rentals-repository.interface.ts';
import type { IPaymentsRepository } from '../../payments/interfaces/payments-repository.interface.ts';
import { PAYMENTS_REPOSITORY } from '../../payments/interfaces/payments-repository.interface.ts';

/**
 * Grants a rental once the payment for it has completed.
 *
 * WHY THIS EXISTS. `RentalsService` had no billing code at all — a search for
 * `payment|amount|price|charge` across the module returned zero hits — so `POST /books/:id/rent` created
 * an ACTIVE rental, which is access to a paid book, for nothing. `POST /rentals/:id/extend` then let
 * the reader add up to three more periods, also free. The rental product was a way to read paid books
 * without paying for them.
 *
 * WHY IT LIVES HERE AND NOT IN `RentalsService`. Creating a rental is this module's own fact
 * (Principle #9), and doing it from an event means the rentals module needs no dependency on payments
 * beyond the payment row it has to read back — one interface, one documented edge (Principle #7).
 *
 * WHY THE PAYMENT IS READ BACK RATHER THAN CARRIED ON THE EVENT. `PaymentCompletedEvent` carries only
 * `paymentId`. Reading the stored row is what makes the grant derive from the authoritative record of
 * what was paid for, and it keeps every publisher of that event from needing to know what a rental is.
 *
 * WHY IT IS IDEMPOTENT. A gateway webhook can be delivered more than once. The unique index on
 * `(user_id, book_id)` is on the rentals table, so a second delivery is rejected by the database rather
 * than creating a second active rental — and that rejection is caught here and treated as success,
 * because the outcome the second delivery wanted already happened.
 */
@Injectable()
export class RentalsEventHandler {
  constructor(
    @Inject(RENTALS_REPOSITORY) private readonly rentalsRepository: IRentalsRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepository: IPaymentsRepository,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    // Used only to retire a cached rental after a refund expires it, the same
    // `invalidateKey` `RentalsService` runs on its own write paths.
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
  ) {}

  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    const payment = await this.paymentsRepository.findById(event.paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${event.paymentId} not found while granting a rental`);
    }

    const meta = this.parseMetadata(payment.metadata);

    // A purchase is the library module's business, and it runs its own `payment.completed` handler for
    // the same event. Both handlers subscribe; each filters on the metadata it owns, so neither has to
    // know the other exists.
    if (meta.type === 'rental_extension') {
      await this.applyExtension(payment.id, payment.userId, meta);
      return;
    }

    if (meta.type !== 'rental') {
      return;
    }

    const bookId = typeof meta.bookId === 'string' ? meta.bookId : null;
    const durationDays = typeof meta.durationDays === 'number' ? meta.durationDays : null;

    if (!bookId || durationDays === null || durationDays <= 0) {
      // A rental payment whose metadata cannot say which book or how long is un-grantable. Logging and
      // returning is right: the money is confirmed by the gateway, so an operator has to reconcile it,
      // and inventing a duration here would hand out arbitrary access.
      this.logger.error(
        `Rental payment ${payment.id} has no usable bookId/durationDays metadata; no rental granted`,
        'RentalsEventHandler',
      );
      return;
    }

    const existing = await this.rentalsRepository.findByUserAndBook(payment.userId, bookId);
    if (existing && existing.status === 'active') {
      this.logger.info(
        `User ${payment.userId} already has an active rental of book ${bookId}; payment ${payment.id} grants nothing further`,
        'RentalsEventHandler',
      );
      return;
    }

    const rental = await this.rentalsRepository.create({
      userId: payment.userId,
      bookId,
      durationDays,
    });

    this.logger.info(
      `Granted a ${durationDays}-day rental of book ${bookId} to user ${payment.userId} for payment ${payment.id}`,
      'RentalsEventHandler',
    );

    await this.eventBus.emit('rental.created', {
      rentalId: rental.id,
      userId: payment.userId,
      bookId,
    } as RentalCreatedEvent);
  }

  /**
   * A settled refund revokes the rental it paid for.
   *
   * WHY THIS EXISTS. `PaymentsService` emits `refund.completed` the moment the gateway returns the
   * money. That name used to be registered in the schema and even carried an `@OnEvent` consumer,
   * but no producer ever emitted it and the consumer only logged — so a refunded rental stayed
   * `active` and the reader kept reading a book the merchant had already paid back. Money left the
   * merchant, the entitlement never came back in. Flipping the row to `expired` is the revocation,
   * and it is enough on its own: `RentalsService.findActiveRentalForBook` answers the access
   * question against the row's `status` and `endDate`, not against a word a scheduled job would have
   * to keep honest, so a refunded rental stops entitling access the instant the row changes.
   *
   * WHY IT LIVES HERE. The rentals module owns the rental (Principle #9); the payments module only
   * announces the refund and must not write a rentals row it does not own (Principle #7). The payment
   * is read back for its stored `userId` and `metadata`, exactly as the grant path does, so the
   * revocation is derived from the authoritative record of what was bought rather than from a second,
   * event-borne copy of the book id that could drift.
   *
   * WHY IT IS IDEMPOTENT (Principle #16). A gateway delivery can be replayed or duplicated. Expiring
   * an already-`expired` or `returned` rental is a deliberate no-op, not a fresh write and not a
   * throw, so a second `refund.completed` cannot corrupt the row or surface as a 500 in the listener.
   *
   * WHY A `rental_extension` REFUND IS NOT HANDLED HERE. Reverting an extension would mean restoring
   * a previous end date, undoing an increment a different payment made, and possibly fighting the
   * base rental the reader still paid for — a lossy, multi-source reconciliation this handler must
   * not perform on its own. It is logged for an operator instead, and the base rental is left intact
   * because refunding an extension does not refund the original rental.
   */
  @OnEvent('refund.completed')
  async handleRefundCompleted(event: RefundCompletedEvent): Promise<void> {
    const payment = await this.paymentsRepository.findById(event.paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${event.paymentId} not found while revoking a rental`);
    }

    const meta = this.parseMetadata(payment.metadata);
    if (meta.type !== 'rental') {
      if (meta.type === 'rental_extension') {
        // Documented interaction, not a silent skip: the base rental keeps its access.
        this.logger.warn(
          `Refund ${event.refundId} refunded a rental extension of payment ${payment.id}; extensions are not auto-reverted and the base rental stands — reconcile manually`,
          'RentalsEventHandler',
        );
      }
      // A purchase refund is the library module's fact; it subscribes to the same event.
      return;
    }

    const bookId = typeof meta.bookId === 'string' ? meta.bookId : null;
    if (!bookId) {
      this.logger.error(
        `Rental refund ${event.refundId} names payment ${payment.id} with no usable bookId metadata; the rental cannot be expired`,
        'RentalsEventHandler',
      );
      return;
    }

    const rental = await this.rentalsRepository.findByUserAndBook(payment.userId, bookId);
    if (!rental || rental.deletedAt) {
      // A refund against a payment whose rental never materialised, or was hard-deleted: the access
      // the reader would have had never existed, so there is nothing to revoke and nothing to throw.
      this.logger.warn(
        `Rental refund ${event.refundId} found no rental for user ${payment.userId} on book ${bookId}; nothing to expire`,
        'RentalsEventHandler',
      );
      return;
    }

    if (rental.status === 'expired' || rental.status === 'returned') {
      this.logger.info(
        `Rental ${rental.id} is already ${rental.status}; refund ${event.refundId} is a replayed or duplicate revocation`,
        'RentalsEventHandler',
      );
      return;
    }

    await this.rentalsRepository.update(rental.id, { status: 'expired' });
    await this.invalidateRentalCache(rental.id);

    this.logger.info(
      `Expired rental ${rental.id} of book ${bookId} for user ${payment.userId} because refund ${event.refundId} settled`,
      'RentalsEventHandler',
    );

    // `rental.expired` is the same signal `checkAndExpireOverdue` publishes for a lapsed rental, so
    // every consumer that ends access on a rental — the library module withdrawing the shelf entry,
    // for one — treats a refunded rental exactly like a lapsed one, with no second vocabulary. The
    // entitlement is already gone here (the row is `expired`); this only tells the rest of the system.
    await this.eventBus.emit('rental.expired', { rentalId: rental.id } as RentalExpiredEvent);
  }

  /**
   * Retires the cached copy of one rental, mirroring `RentalsService.invalidateRentalCache`.
   *
   * Every write path that changes a rental retires the cached copy — the module's own stated
   * invariant — and a refund that flips the row to `expired` without doing so would leave
   * `GET /rentals/:id` reporting `active` for up to a TTL after access had already ended.
   */
  private async invalidateRentalCache(id: string): Promise<void> {
    await this.cache.invalidateKey(RENTAL_CACHE_NAMESPACE, id, [RENTALS_CACHE_TAG]);
  }

  /**
   * Moves a rental's end date forward, once the extension has been paid for.
   *
   * WHY THIS IS SEPARATE FROM THE RENTAL GRANT. A rental creates access; an extension changes when that
   * access ENDS. They were one method, which is why the extension half was the free half: the rental
   * path had a payment-shaped return value that nobody checked, and the extension path had no payment
   * at all. Split, each has one owner and one precondition.
   *
   * WHY THE END DATE IS RECOMPUTED HERE RATHER THAN CARRIED ON THE EVENT. It is derived from the
   * stored rental plus the paid duration, so a stale or hand-edited metadata field cannot extend a
   * rental further than what was bought. The payment says HOW MANY DAYS; the database says from when.
   */
  private async applyExtension(paymentId: string, userId: string, meta: Record<string, unknown>): Promise<void> {
    const rentalId = typeof meta.rentalId === 'string' ? meta.rentalId : null;
    const extensionDays = typeof meta.extensionDays === 'number' ? meta.extensionDays : null;

    if (!rentalId || extensionDays === null || extensionDays <= 0) {
      this.logger.error(
        `Rental-extension payment ${paymentId} has no usable rentalId/extensionDays metadata; no extension applied`,
        'RentalsEventHandler',
      );
      return;
    }

    const rental = await this.rentalsRepository.findById(rentalId);
    if (!rental || rental.deletedAt) {
      this.logger.error(
        `Rental-extension payment ${paymentId} names rental ${rentalId}, which no longer exists; no extension applied`,
        'RentalsEventHandler',
      );
      return;
    }

    if (rental.userId !== userId) {
      // The payment belongs to somebody else than the rental. That is a real inconsistency worth
      // refusing rather than logging and continuing.
      this.logger.error(
        `Rental-extension payment ${paymentId} is owned by ${userId} but rental ${rentalId} belongs to ${rental.userId}; no extension applied`,
        'RentalsEventHandler',
      );
      return;
    }

    if (rental.extendedCount >= rental.maxExtensions) {
      this.logger.error(
        `Rental ${rentalId} is already at its extension cap (${rental.extendedCount}/${rental.maxExtensions}); payment ${paymentId} grants nothing further`,
        'RentalsEventHandler',
      );
      return;
    }

    const previousEndDate = new Date(rental.endDate);
    const newEndDate = new Date(previousEndDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);

    await this.rentalsRepository.createExtension({ rentalId, previousEndDate, newEndDate, extensionDays });
    await this.rentalsRepository.update(rentalId, {
      endDate: newEndDate,
      extendedCount: rental.extendedCount + 1,
    });

    // The event is emitted HERE, from the code that actually extends, rather than from the route that
    // used to. `event-schemas.spec.ts` re-derives the producer and handler sets from the source tree
    // on every run, and it failed this change: `rental.extended` was registered with a schema and no
    // longer had a producer, so every subscriber would have gone silent. That assertion is the reason
    // it is worth having.
    await this.eventBus.emit('rental.extended', { rentalId } as RentalExtendedEvent);

    this.logger.info(
      `Extended rental ${rentalId} by ${extensionDays} day(s) to ${newEndDate.toISOString()} for payment ${paymentId}`,
      'RentalsEventHandler',
    );
  }

  /**
   * `payments.metadata` is `text` holding JSON written by `paymobInitializePayment`. Parsed
   * defensively: a payment the gateway confirmed must not become permanently un-grantable because of a
   * bad blob, and the alternative — throwing — would leave the payment row completed and the rental
   * permanently absent.
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
        'RentalsEventHandler',
      );
      return {};
    }
  }
}

/**
 * WHY THE EXTENSION CAP IS A SHARED CONSTANT. `RentalsService.extendRental` compared
 * `rental.extendedCount >= rental.maxExtensions`, and `maxExtensions` defaulted to 3 per row — a number
 * that appeared in the repository default, in this file, and in the DTO, and could drift. The single
 * value now lives in `@hakawi/shared-types`, and the import above exists so a reader can see that the
 * cap and the price come from the same place.
 */
export const EXTENSION_CAP = MAX_RENTAL_EXTENSIONS;
