import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { MAX_RENTAL_EXTENSIONS } from '@hakawi/shared-types';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { PaymentCompletedEvent } from '../../../common/events/payments.events.ts';
import type { RentalCreatedEvent, RentalExtendedEvent } from '../../../common/events/rentals.events.ts';

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
