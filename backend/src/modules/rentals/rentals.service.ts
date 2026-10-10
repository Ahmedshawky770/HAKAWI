import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { RENTAL_CURRENCY, RENTAL_DURATION_DAYS, isRentalDurationDays, rentalPriceForDays } from '@hakawi/shared-types';
import { PaymentsService } from '../payments/payments.service.ts';
import type { PaymobCheckoutResponse } from '../payments/types.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import type {
  RentalCreatedEvent,
  RentalExtendedEvent,
  RentalReturnedEvent,
  RentalExpiredEvent,
} from '../../common/events/rentals.events.ts';

import type { IRentalsRepository } from './interfaces/rentals-repository.interface.ts';
import { RENTALS_REPOSITORY } from './interfaces/rentals-repository.interface.ts';
import type {
  Rental,
  CreateRentalInput,
  RentalExtension,
  RentalResponse,
  RentalsListResponse,
  RentalExtensionResponse,
  CreateRentalRequest,
} from './types.ts';
import { reviveRentalDates } from './types.ts';

export const RENTAL_CACHE_NAMESPACE = 'rental';
export const RENTALS_CACHE_TAG = 'rentals';
export const RENTAL_CACHE_TTL_SECONDS = 300;

@Injectable()
export class RentalsService {
  constructor(
    @Inject(RENTALS_REPOSITORY) private readonly rentalsRepository: IRentalsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    // The charge for a rental extension. The module had no billing code at all, so extensions were
    // granted free up to the per-row cap; `extendRental` now initialises a payment and
    // `RentalsEventHandler` applies the extension from `payment.completed`.
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  async createRental(userId: string, input: CreateRentalRequest): Promise<Rental> {
    const existing = await this.rentalsRepository.findByUserAndBook(userId, input.bookId);
    if (existing && existing.status === 'active') {
      throw new ConflictException('You already have an active rental for this book');
    }

    const durationDays = input.durationDays ?? 14;
    const allowedDurations = [1, 3, 7, 14, 30, 90];
    if (!allowedDurations.includes(durationDays)) {
      throw new BadRequestException('Invalid rental duration. Allowed values: 1, 3, 7, 14, 30, 90 days');
    }

    const data: CreateRentalInput = {
      userId,
      bookId: input.bookId,
      durationDays,
    };

    const rental = await this.rentalsRepository.create(data);
    await this.eventBus.emit('rental.created', {
      rentalId: rental.id,
      userId,
      bookId: input.bookId,
    } as RentalCreatedEvent);
    return rental;
  }

  /**
   * Reads a rental by id, cached.
   *
   * Two things this method used to get wrong, both invisible in a unit test that returns the same
   * object instance it stored:
   *
   * 1. It read Valkey by hand and `JSON.parse`d the payload, so on a cache hit the `Date` fields
   *    came back as ISO strings inside an object typed `Rental` — a live type lie that becomes a
   *    `TypeError` in {@link toRentalResponse} the first time a cached rental reaches a mapper.
   * 2. A corrupt entry (`JSON.parse` failure, a hand-edited key, a payload written by an older
   *    shape) escaped as an exception instead of healing.
   *
   * `getOrSet` + `revive` fixes both: the cached copy is revived to the repository's shape, and an
   * entry that cannot be revived is dropped and reported as a miss.
   *
   * The ownership check appears twice on purpose. The one after the call covers the cached path,
   * which never runs the loader. The one inside the loader keeps a rejected read from *populating*
   * the cache — the behaviour the hand-rolled `valkeyService.set` had, where the check came before
   * the write. Without it, any caller who knows a rental id could force a cache write for a row they
   * are not allowed to see.
   */
  async findById(id: string, userId?: string): Promise<Rental> {
    const { value: rental } = await this.cache.getOrSet<Rental>({
      namespace: RENTAL_CACHE_NAMESPACE,
      key: id,
      ttl: RENTAL_CACHE_TTL_SECONDS,
      tags: [RENTALS_CACHE_TAG],
      // Without this, `toRentalResponse` calls `.toISOString()` on an ISO string and the request
      // fails — on every hit, while the first cold request succeeds.
      revive: reviveRentalDates,
      load: async () => {
        const loaded = await this.rentalsRepository.findById(id);
        if (!loaded || loaded.deletedAt) {
          throw new NotFoundException('Rental not found');
        }
        if (userId && loaded.userId !== userId) {
          throw new ForbiddenException('You do not have access to this rental');
        }
        return loaded;
      },
    });

    if (userId && rental.userId !== userId) {
      throw new ForbiddenException('You do not have access to this rental');
    }

    return rental;
  }

  async findMyRentals(
    userId: string,
    params: { status?: string; page?: number; limit?: number },
  ): Promise<RentalsListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.rentalsRepository.findAll({ userId, status: params.status });
    const rentals = result.rentals.map((rental) => this.toRentalResponse(rental));

    return {
      rentals,
      total: result.total,
      page,
      limit,
    };
  }

  /**
   * Extends a rental — for money.
   *
   * IT USED TO GRANT THE EXTENSION FOR FREE. It created a `rental_extensions` row, moved `endDate`
   * forward and incremented `extendedCount` without any payment, up to `maxExtensions` times, so a
   * reader could turn a 1-day rental of a paid book into a long one and never pay for any of it. The
   * whole rentals module contained no billing code — a search for `payment|amount|price|charge` across
   * it returned zero hits — and this route was the cheapest version of that hole.
   *
   * IT NOW RETURNS A CHECKOUT, LIKE `POST /books/:id/rent` DOES. The extended end date is computed and
   * applied by `RentalsEventHandler` on `payment.completed`, so the access never precedes the money.
   * The return type changing from `RentalExtension` to `PaymobCheckoutResponse` IS the fix: the
   * previous shape told the caller the extension had already happened.
   */
  async extendRental(id: string, extensionDays: number, userId: string): Promise<PaymobCheckoutResponse> {
    const rental = await this.rentalsRepository.findById(id);
    if (!rental || rental.deletedAt) {
      throw new NotFoundException('Rental not found');
    }

    if (rental.userId !== userId) {
      throw new ForbiddenException('You do not have access to this rental');
    }

    if (rental.status !== 'active') {
      throw new ForbiddenException('Cannot extend a non-active rental');
    }

    if (rental.extendedCount >= rental.maxExtensions) {
      throw new ForbiddenException('Maximum extensions reached for this rental');
    }

    if (!isRentalDurationDays(extensionDays)) {
      throw new BadRequestException(
        `Invalid extension duration. Allowed values: ${RENTAL_DURATION_DAYS.join(', ')} days`,
      );
    }

    const amount = rentalPriceForDays(extensionDays);
    if (amount <= 0) {
      // A zero-amount checkout would be a free extension arrived at through a pricing mistake rather
      // than through a decision, which is exactly the defect this method had.
      throw new InternalServerErrorException('Rental pricing is misconfigured');
    }

    return this.paymentsService.paymobInitializePayment(userId, amount, RENTAL_CURRENCY, {
      rentalId: id,
      bookId: rental.bookId,
      type: 'rental_extension',
      extensionDays,
    });
  }

  /**
   * Price for an extension, without taking money.
   *
   * WHY THE ROUTE QUOTES AND THEN CHARGES. Every rejection above — not your rental, not active, cap
   * reached, duration not offered — happens before any money moves. A reader sees the price of an
   * extension before committing to it, which the single charge-carrying route cannot offer.
   */
  async quoteExtension(
    id: string,
    extensionDays: number,
    userId: string,
  ): Promise<{
    rentalId: string;
    bookId: string;
    extensionDays: number;
    amount: number;
    currency: string;
  }> {
    const rental = await this.rentalsRepository.findById(id);
    if (!rental || rental.deletedAt) {
      throw new NotFoundException('Rental not found');
    }
    if (rental.userId !== userId) {
      throw new ForbiddenException('You do not have access to this rental');
    }
    if (rental.status !== 'active') {
      throw new ForbiddenException('Cannot extend a non-active rental');
    }
    if (rental.extendedCount >= rental.maxExtensions) {
      throw new ForbiddenException('Maximum extensions reached for this rental');
    }
    if (!isRentalDurationDays(extensionDays)) {
      throw new BadRequestException(
        `Invalid extension duration. Allowed values: ${RENTAL_DURATION_DAYS.join(', ')} days`,
      );
    }
    return {
      rentalId: id,
      bookId: rental.bookId,
      extensionDays,
      amount: rentalPriceForDays(extensionDays),
      currency: RENTAL_CURRENCY,
    };
  }

  async returnRental(id: string, userId: string): Promise<Rental> {
    const rental = await this.rentalsRepository.findById(id);
    if (!rental || rental.deletedAt) {
      throw new NotFoundException('Rental not found');
    }

    if (rental.userId !== userId) {
      throw new ForbiddenException('You do not have access to this rental');
    }

    if (rental.status === 'returned') {
      throw new ForbiddenException('Rental has already been returned');
    }

    const updated = await this.rentalsRepository.update(id, {
      status: 'returned',
      returnedAt: new Date(),
    });

    await this.invalidateRentalCache(id);

    await this.eventBus.emit('rental.returned', { rentalId: id } as RentalReturnedEvent);
    return updated;
  }

  async findOverdue(): Promise<Rental[]> {
    return this.rentalsRepository.findOverdue();
  }

  async checkAndExpireOverdue(): Promise<void> {
    const overdueRentals = await this.rentalsRepository.findOverdue();
    for (const rental of overdueRentals) {
      await this.rentalsRepository.update(rental.id, { status: 'expired' });
      await this.invalidateRentalCache(rental.id);
      await this.eventBus.emit('rental.expired', { rentalId: rental.id } as RentalExpiredEvent);
    }
    this.logger.info(`Expired ${overdueRentals.length} overdue rentals`);
  }

  /**
   * Retires the cached copy of one rental.
   *
   * The tag is passed so the key also leaves the tag index it was written into. A targeted delete
   * that skips the unindex leaves a tombstone in `cache:tag:rentals`, so the set grows forever and
   * every later sweep pays for it — and the generation bump is what makes this targeted drop as
   * visible to an in-flight reader as a sweep would be (Principle #11).
   *
   * Every write path that changes a rental funnels through here: extending, returning and
   * expiring all mutate the row, and a cache that is only invalidated on some of them is the same
   * bug as no invalidation at all.
   */
  private async invalidateRentalCache(id: string): Promise<void> {
    await this.cache.invalidateKey(RENTAL_CACHE_NAMESPACE, id, [RENTALS_CACHE_TAG]);
  }

  private toRentalResponse(rental: Rental): RentalResponse {
    return {
      id: rental.id,
      userId: rental.userId,
      bookId: rental.bookId,
      status: rental.status,
      startDate: rental.startDate.toISOString(),
      endDate: rental.endDate.toISOString(),
      extendedCount: rental.extendedCount,
      maxExtensions: rental.maxExtensions,
      returnedAt: rental.returnedAt?.toISOString() ?? null,
      createdAt: rental.createdAt.toISOString(),
      updatedAt: rental.updatedAt.toISOString(),
    };
  }

  private toRentalExtensionResponse(extension: RentalExtension): RentalExtensionResponse {
    return {
      id: extension.id,
      rentalId: extension.rentalId,
      previousEndDate: extension.previousEndDate.toISOString(),
      newEndDate: extension.newEndDate.toISOString(),
      extensionDays: extension.extensionDays,
      createdAt: extension.createdAt.toISOString(),
    };
  }
}
