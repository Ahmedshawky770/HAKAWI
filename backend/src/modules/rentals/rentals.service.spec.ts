import { describe, it, expect, beforeEach, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { RENTAL_CURRENCY, rentalPriceForDays } from '@hakawi/shared-types';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import type { PaymentsService } from '../payments/payments.service.ts';
import { RENTAL_CACHE_NAMESPACE, RentalsService } from './rentals.service.ts';
import type { IRentalsRepository } from './interfaces/rentals-repository.interface.ts';
import type { Rental, CreateRentalInput, RentalExtension } from './types.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

/**
 * An in-memory stand-in for `TaggedCacheService` that reproduces the one behaviour these tests
 * exist to pin down: it stores with `JSON.stringify` and reads back with `JSON.parse`, exactly
 * like Valkey does.
 *
 * A mock that handed back the very object it was given would keep passing after the bug came
 * back, because that object still has real `Date`s — the whole failure only exists once the value
 * has been through a serialize/deserialize cycle. It also drops an entry whose revival throws,
 * the way the real service does, so a corrupt payload heals into a miss instead of a 500.
 */
class FakeTaggedCache {
  private readonly store = new Map<string, string>();
  readonly invalidations: { namespace: string; key: string; tags: readonly string[] }[] = [];
  loadCount = 0;

  buildKey(namespace: string, key: string): string {
    return `cache:${namespace}:${key}`;
  }

  /** Writes an entry the way a cache miss followed by a write would. */
  seed(namespace: string, key: string, value: unknown): void {
    this.store.set(this.buildKey(namespace, key), JSON.stringify(value));
  }

  /** Writes raw bytes, so a spec can plant a payload from an older shape. */
  seedRaw(namespace: string, key: string, raw: string): void {
    this.store.set(this.buildKey(namespace, key), raw);
  }

  async get<T>(namespace: string, key: string, revive?: (value: T) => T): Promise<T | null> {
    const cacheKey = this.buildKey(namespace, key);
    const raw = this.store.get(cacheKey);
    if (raw === undefined) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as T;
      return revive === undefined ? parsed : revive(parsed);
    } catch {
      this.store.delete(cacheKey);
      return null;
    }
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    this.store.set(this.buildKey(namespace, key), JSON.stringify(value));
  }

  async getOrSet<T>(options: {
    namespace: string;
    key: string;
    load: () => Promise<T>;
    revive?: (value: T) => T;
  }): Promise<{ value: T; hit: boolean }> {
    const cached = await this.get<T>(options.namespace, options.key, options.revive);
    if (cached !== null) {
      return { value: cached, hit: true };
    }
    this.loadCount += 1;
    const loaded = await options.load();
    await this.set(options.namespace, options.key, loaded);
    return { value: loaded, hit: false };
  }

  async invalidateKey(namespace: string, key: string, tags: readonly string[] = []): Promise<void> {
    this.store.delete(this.buildKey(namespace, key));
    this.invalidations.push({ namespace, key, tags });
  }
}

type MockRentalsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Rental | null>>>;
  findByUserAndBook: ReturnType<typeof vi.fn<(userId: string, bookId: string) => Promise<Rental | null>>>;
  findActiveByUser: ReturnType<typeof vi.fn<(userId: string) => Promise<Rental[]>>>;
  findAll: ReturnType<
    typeof vi.fn<
      (params: {
        userId?: string;
        status?: string;
        page?: number;
        limit?: number;
      }) => Promise<{ rentals: Rental[]; total: number }>
    >
  >;
  create: ReturnType<typeof vi.fn<(data: CreateRentalInput) => Promise<Rental>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<Rental>) => Promise<Rental>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  createExtension: ReturnType<
    typeof vi.fn<
      (data: {
        rentalId: string;
        previousEndDate: Date;
        newEndDate: Date;
        extensionDays: number;
      }) => Promise<RentalExtension>
    >
  >;
  findExtensionsByRental: ReturnType<typeof vi.fn<(rentalId: string) => Promise<RentalExtension[]>>>;
  findOverdue: ReturnType<typeof vi.fn<() => Promise<Rental[]>>>;
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

describe('RentalsService', () => {
  let rentalsService: RentalsService;
  // `extendRental` initialises a payment, so the module takes PaymentsService. It did not before
  // because the module had no billing code at all.
  let paymentsService: { paymobInitializePayment: ReturnType<typeof vi.fn> };
  let rentalsRepository: MockRentalsRepository;
  let logger: MockWinstonLoggerService;
  let cache: FakeTaggedCache;
  let eventValidatorService: MockEventValidatorService;

  const mockRental: Rental = {
    id: 'rental-123',
    userId: 'user-123',
    bookId: 'book-123',
    status: 'active',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-15'),
    extendedCount: 0,
    maxExtensions: 2,
    returnedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    rentalsRepository = {
      findById: vi.fn<(id: string) => Promise<Rental | null>>(),
      findByUserAndBook: vi.fn<(userId: string, bookId: string) => Promise<Rental | null>>(),
      findActiveByUser: vi.fn<(userId: string) => Promise<Rental[]>>(),
      findAll:
        vi.fn<
          (params: {
            userId?: string;
            status?: string;
            page?: number;
            limit?: number;
          }) => Promise<{ rentals: Rental[]; total: number }>
        >(),
      create: vi.fn<(data: CreateRentalInput) => Promise<Rental>>(),
      update: vi.fn<(id: string, data: Partial<Rental>) => Promise<Rental>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      createExtension:
        vi.fn<
          (data: {
            rentalId: string;
            previousEndDate: Date;
            newEndDate: Date;
            extensionDays: number;
          }) => Promise<RentalExtension>
        >(),
      findExtensionsByRental: vi.fn<(rentalId: string) => Promise<RentalExtension[]>>(),
      findOverdue: vi.fn<() => Promise<Rental[]>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    cache = new FakeTaggedCache();

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    paymentsService = {
      paymobInitializePayment: vi.fn().mockResolvedValue({ checkoutUrl: 'https://paymob.test/iframes/abc' }),
    };

    rentalsService = new RentalsService(
      rentalsRepository,
      logger as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
      eventValidatorService as unknown as EventValidatorService,
      paymentsService as unknown as PaymentsService,
    );
  });

  describe('createRental', () => {
    it('should create a rental successfully', async () => {
      const createInput: CreateRentalInput = {
        userId: 'user-123',
        bookId: 'book-123',
        durationDays: 14,
      };

      vi.mocked(rentalsRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(rentalsRepository.create).mockResolvedValue({
        ...mockRental,
        ...createInput,
        id: 'rental-456',
      });

      const result = await rentalsService.createRental('user-123', createInput);

      expect(result).toHaveProperty('id', 'rental-456');
      expect(result.status).toBe('active');
      expect(rentalsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          bookId: 'book-123',
          durationDays: 14,
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.created', expect.any(Object));
    });

    it('should throw ConflictException when user already has an active rental', async () => {
      const createInput: CreateRentalInput = {
        userId: 'user-123',
        bookId: 'book-123',
        durationDays: 7,
      };

      vi.mocked(rentalsRepository.findByUserAndBook).mockResolvedValue(mockRental);

      await expect(rentalsService.createRental('user-123', createInput)).rejects.toThrow(
        'You already have an active rental for this book',
      );
    });
  });

  describe('findById', () => {
    it('should return a rental by id', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);

      const result = await rentalsService.findById('rental-123', 'user-123');

      expect(result).toEqual(mockRental);
      expect(rentalsRepository.findById).toHaveBeenCalledWith('rental-123');
    });

    it('should throw NotFoundException when rental not found', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(null);

      await expect(rentalsService.findById('rental-999', 'user-123')).rejects.toThrow('Rental not found');
    });

    it('serves the second call from the cache without touching the repository', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);

      await rentalsService.findById('rental-123', 'user-123');
      const cached = await rentalsService.findById('rental-123', 'user-123');

      expect(rentalsRepository.findById).toHaveBeenCalledTimes(1);
      expect(cached).toEqual(mockRental);
    });

    /**
     * The regression this module was fixed for, exercised through a real serialize → deserialize
     * round trip: the second call is served by an entry that has been through `JSON.stringify` and
     * `JSON.parse`, which is exactly how the cache hands values back in production.
     *
     * Without date revival the cached value carries ISO strings in fields typed `Date`, so
     * `toRentalResponse` — the mapper `findMyRentals` runs on the same entity — would die with
     * `TypeError: rental.startDate.toISOString is not a function` on every warm key while the very
     * first request succeeded. `.toISOString()` is called here on purpose: asserting on `instanceof`
     * alone would not reproduce the failure the client actually saw.
     */
    it('returns Date instances on a cache hit, so the response mapper cannot fail', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue({ ...mockRental, returnedAt: new Date('2024-01-20') });

      const cold = await rentalsService.findById('rental-123', 'user-123');
      const warm = await rentalsService.findById('rental-123', 'user-123');

      expect(warm.startDate).toBeInstanceOf(Date);
      expect(warm.endDate).toBeInstanceOf(Date);
      expect(warm.returnedAt).toBeInstanceOf(Date);
      expect(warm.createdAt).toBeInstanceOf(Date);
      expect(warm.updatedAt).toBeInstanceOf(Date);
      // The exact call the mapper makes, proven to work on the warm value.
      expect(warm.startDate.toISOString()).toBe(cold.startDate.toISOString());
      expect(warm.returnedAt?.toISOString()).toBe('2024-01-20T00:00:00.000Z');
    });

    it('revives a nullable date to null instead of to an un-revivable value', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);

      await rentalsService.findById('rental-123', 'user-123');
      const warm = await rentalsService.findById('rental-123', 'user-123');

      expect(warm.returnedAt).toBeNull();
      expect(warm.deletedAt).toBeNull();
    });

    it('drops an un-revivable cache entry and reloads instead of throwing', async () => {
      // `createdAt: null` cannot be the row that was cached, because the column is `notNull`.
      // The entry is corrupt, so it must heal into a miss rather than become a 500.
      cache.seedRaw(RENTAL_CACHE_NAMESPACE, 'rental-123', JSON.stringify({ ...mockRental, createdAt: null }));
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);

      const result = await rentalsService.findById('rental-123', 'user-123');

      expect(result).toEqual(mockRental);
      expect(rentalsRepository.findById).toHaveBeenCalledTimes(1);
    });

    it('drops an unparseable cache entry and reloads instead of throwing', async () => {
      cache.seedRaw(RENTAL_CACHE_NAMESPACE, 'rental-123', 'not json at all');
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);

      const result = await rentalsService.findById('rental-123', 'user-123');

      expect(result).toEqual(mockRental);
    });

    it('still enforces ownership on a cache hit', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);
      await rentalsService.findById('rental-123', 'user-123');

      await expect(rentalsService.findById('rental-123', 'someone-else')).rejects.toThrow(
        'You do not have access to this rental',
      );
    });

    it('does not populate the cache for a read the caller is not allowed to make', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);

      await expect(rentalsService.findById('rental-123', 'someone-else')).rejects.toThrow(
        'You do not have access to this rental',
      );
      // The rejected load must not be written: any caller who knows the id could otherwise force a
      // cache write for a row they cannot see. Proven by the owner's own read still needing the
      // repository, i.e. the entry was never written.
      await rentalsService.findById('rental-123', 'user-123');

      expect(rentalsRepository.findById).toHaveBeenCalledTimes(2);
    });

    it('does not cache a rental that was not found', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(null);

      await expect(rentalsService.findById('rental-999', 'user-123')).rejects.toThrow('Rental not found');
      await expect(rentalsService.findById('rental-999', 'user-123')).rejects.toThrow('Rental not found');

      expect(rentalsRepository.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('extendRental', () => {
    it('should extend a rental successfully', async () => {
      const activeRental = { ...mockRental, extendedCount: 0, maxExtensions: 2 };
      const newEndDate = new Date('2024-01-29');
      const extension: RentalExtension = {
        id: 'ext-123',
        rentalId: 'rental-123',
        previousEndDate: new Date('2024-01-15'),
        newEndDate,
        extensionDays: 14,
        createdAt: new Date(),
      };

      vi.mocked(rentalsRepository.findById).mockResolvedValue(activeRental);
      vi.mocked(rentalsRepository.createExtension).mockResolvedValue(extension);
      vi.mocked(rentalsRepository.update).mockResolvedValue({ ...activeRental, endDate: newEndDate, extendedCount: 1 });

      // The old assertion was `expect(result).toEqual(extension)` — the extension had ALREADY
      // been written and the end date moved, for free. It now initialises a payment, and
      // `RentalsEventHandler` applies the extension from `payment.completed`.
      const result = await rentalsService.extendRental('rental-123', 14, 'user-123');

      expect(paymentsService.paymobInitializePayment).toHaveBeenCalledTimes(1);
      const [, amount, currency, metadata] = vi.mocked(paymentsService.paymobInitializePayment).mock.calls[0]!;

      expect(amount).toBe(rentalPriceForDays(14));
      expect(currency).toBe(RENTAL_CURRENCY);
      expect(metadata).toMatchObject({
        rentalId: 'rental-123',
        bookId: activeRental.bookId,
        type: 'rental_extension',
        extensionDays: 14,
      });
      expect(result).toBeDefined();

      // The access change has NOT happened yet, and this is the whole point: the end date is moved
      // only when `payment.completed` arrives. A test that asserted `createExtension` had been called
      // here is a test that asserts the free extension this change set removes.
      expect(rentalsRepository.createExtension).not.toHaveBeenCalled();
      expect(rentalsRepository.update).not.toHaveBeenCalled();

      // Nor is `rental.extended` emitted: subscribers would read an extension that has not happened.
      expect(eventValidatorService.emit).not.toHaveBeenCalledWith('rental.extended', expect.any(Object));
    });

    it('should throw ForbiddenException when rental is not active', async () => {
      const returnedRental = { ...mockRental, status: 'returned' as const };
      vi.mocked(rentalsRepository.findById).mockResolvedValue(returnedRental);

      await expect(rentalsService.extendRental('rental-123', 14, 'user-123')).rejects.toThrow(
        'Cannot extend a non-active rental',
      );
    });

    it('should throw ForbiddenException when max extensions reached', async () => {
      const maxExtensionsRental = { ...mockRental, extendedCount: 2, maxExtensions: 2 };
      vi.mocked(rentalsRepository.findById).mockResolvedValue(maxExtensionsRental);

      await expect(rentalsService.extendRental('rental-123', 14, 'user-123')).rejects.toThrow(
        'Maximum extensions reached for this rental',
      );
    });
  });

  describe('returnRental', () => {
    it('should return a rental successfully', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);
      vi.mocked(rentalsRepository.update).mockResolvedValue({
        ...mockRental,
        status: 'returned',
        returnedAt: new Date(),
      });

      const result = await rentalsService.returnRental('rental-123', 'user-123');

      expect(result.status).toBe('returned');
      expect(result.returnedAt).not.toBeNull();
      expect(rentalsRepository.update).toHaveBeenCalledWith(
        'rental-123',
        expect.objectContaining({ status: 'returned', returnedAt: expect.any(Date) }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.returned', expect.any(Object));
    });

    it('should throw ForbiddenException when rental already returned', async () => {
      const returnedRental = { ...mockRental, status: 'returned' as const };
      vi.mocked(rentalsRepository.findById).mockResolvedValue(returnedRental);

      await expect(rentalsService.returnRental('rental-123', 'user-123')).rejects.toThrow(
        'Rental has already been returned',
      );
    });
  });

  describe('findOverdue', () => {
    it('should return overdue rentals', async () => {
      const overdueRentals = [mockRental];
      vi.mocked(rentalsRepository.findOverdue).mockResolvedValue(overdueRentals);

      const result = await rentalsService.findOverdue();

      expect(result).toHaveLength(1);
      expect(rentalsRepository.findOverdue).toHaveBeenCalled();
    });
  });

  describe('checkAndExpireOverdue', () => {
    it('should expire overdue rentals', async () => {
      const overdueRentals = [mockRental];
      vi.mocked(rentalsRepository.findOverdue).mockResolvedValue(overdueRentals);
      vi.mocked(rentalsRepository.update).mockResolvedValue({ ...mockRental, status: 'expired' });

      await rentalsService.checkAndExpireOverdue();

      expect(rentalsRepository.findOverdue).toHaveBeenCalled();
      expect(rentalsRepository.update).toHaveBeenCalledWith('rental-123', { status: 'expired' });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.expired', expect.any(Object));
    });
  });
});
