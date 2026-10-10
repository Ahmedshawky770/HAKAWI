import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';

import type { CreateRentalInput } from '../interfaces/rentals-repository.interface.ts';
import { rentals, rentalExtensions } from '../../../db/schema/rentals.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { RentalsRepository } from './rentals.repository.ts';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
}));

vi.mock('../../../common/services/winston-logger.service.ts', () => ({
  WinstonLoggerService: class {
    info = logger.info;
    log = logger.log;
    error = logger.error;
    warn = logger.warn;
    debug = logger.debug;
    verbose = logger.verbose;
  },
}));

const RENTAL_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BOOK_ID = '33333333-3333-4333-8333-333333333333';

/** The instant `findOverdue` bakes into its `< now` boundary when the clock is frozen. */
const OVERDUE_CLOCK = new Date('2026-03-10T08:00:00.000Z');

/**
 * Whole local calendar days between two instants. `setDate` is calendar arithmetic, so a DST
 * transition inside the loan window shifts the millisecond gap by an hour.
 */
const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      86_400_000,
  );

describe('RentalsRepository', () => {
  let repository: RentalsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  /** The row literal the insert of the only query built in this test was given. */
  const valuesOf = (): Record<string, unknown> => (firstArgsOf(chains[0]!, 'values') as [Record<string, unknown>])[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new RentalsRepository(logger as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('findById', () => {
    it('returns the rental when one matches', async () => {
      control.queue([{ id: RENTAL_ID, userId: USER_ID, status: 'active' }]);

      await expect(repository.findById(RENTAL_ID)).resolves.toMatchObject({ id: RENTAL_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('narrows the lookup to the requested id and takes a single row', async () => {
      control.queue([]);

      await repository.findById(RENTAL_ID);

      expect(whereOf()).toEqual(eq(rentals.id, RENTAL_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(RENTAL_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(RENTAL_ID)).rejects.toBe(failure);
    });
  });

  describe('findByUserAndBook', () => {
    it('returns the rental of that book held by that user', async () => {
      control.queue([{ id: RENTAL_ID, userId: USER_ID, bookId: BOOK_ID }]);

      await expect(repository.findByUserAndBook(USER_ID, BOOK_ID)).resolves.toMatchObject({ id: RENTAL_ID });
    });

    it('excludes a soft-deleted rental, which would otherwise shadow a re-borrow', async () => {
      // `eq(deletedAt, null)` would compile to `deleted_at = NULL` and match nothing at all.
      control.queue([]);

      await repository.findByUserAndBook(USER_ID, BOOK_ID);

      expect(whereOf()).toEqual(
        and(eq(rentals.userId, USER_ID), eq(rentals.bookId, BOOK_ID), isNull(rentals.deletedAt)),
      );
    });

    it('returns null when the user never rented that book', async () => {
      control.queue([]);

      await expect(repository.findByUserAndBook(USER_ID, BOOK_ID)).resolves.toBeNull();
    });
  });

  describe('findActiveByUser', () => {
    it('returns only live rentals in the active state', async () => {
      control.queue([{ id: RENTAL_ID, status: 'active' }]);

      await expect(repository.findActiveByUser(USER_ID)).resolves.toEqual([{ id: RENTAL_ID, status: 'active' }]);

      expect(whereOf()).toEqual(
        and(eq(rentals.userId, USER_ID), eq(rentals.status, 'active'), isNull(rentals.deletedAt)),
      );
    });

    it('returns an empty list when the user holds nothing', async () => {
      control.queue([]);

      await expect(repository.findActiveByUser(USER_ID)).resolves.toEqual([]);
    });
  });

  describe('findAll', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: RENTAL_ID }], [{ total: 1 }]);

      await expect(repository.findAll({ userId: USER_ID })).resolves.toEqual({
        rentals: [{ id: RENTAL_ID }],
        total: 1,
      });
    });

    it('excludes soft-deleted rentals even when no filter is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(whereOf()).toEqual(and(isNull(rentals.deletedAt)));
    });

    it('adds an owner filter when a userId is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ userId: USER_ID });

      expect(whereOf()).toEqual(and(isNull(rentals.deletedAt), eq(rentals.userId, USER_ID)));
    });

    it('passes the requested status straight to the predicate', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ status: 'extended' });

      expect(whereOf()).toEqual(and(isNull(rentals.deletedAt), eq(rentals.status, 'extended')));
    });

    it('combines both filters with the soft-delete rule', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ userId: USER_ID, status: 'returned' });

      expect(whereOf()).toEqual(
        and(isNull(rentals.deletedAt), eq(rentals.userId, USER_ID), eq(rentals.status, 'returned')),
      );
    });

    it('uses one shared visibility predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ userId: USER_ID, status: 'active' });

      // If the page and the count disagreed, `total` would not match the rows returned.
      expect(whereOf(1)).toBe(whereOf(0));
      expect(firstArgsOf(chains[1]!, 'from')).toEqual([rentals]);
    });

    it('defaults to the first page of twenty with a zero offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates a later page from the requested limit', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ page: 3, limit: 10 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('orders newest first and reads from the rentals table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([rentals]);
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(rentals.createdAt)]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '9' }]);

      await expect(repository.findAll({})).resolves.toMatchObject({ total: 9 });
    });

    it('propagates a database failure instead of returning a partial page', async () => {
      const failure = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      control.queueRejection(failure);

      await expect(repository.findAll({ userId: USER_ID })).rejects.toBe(failure);
    });
  });

  describe('create', () => {
    it('inserts an active rental with the requested window and returns it', async () => {
      control.queue([{ id: RENTAL_ID, status: 'active' }]);

      const created = await repository.create({ userId: USER_ID, bookId: BOOK_ID, durationDays: 7 });

      expect(created).toMatchObject({ id: RENTAL_ID });
      expect(db.insert).toHaveBeenCalledWith(rentals);

      const values = valuesOf();
      expect(values).toMatchObject({
        userId: USER_ID,
        bookId: BOOK_ID,
        status: 'active',
        extendedCount: 0,
        maxExtensions: 2,
      });
      expect(values.startDate).toBeInstanceOf(Date);
    });

    it('derives the end date from the requested duration', async () => {
      const startedAt = Date.now();
      control.queue([{ id: RENTAL_ID }]);

      await repository.create({ userId: USER_ID, bookId: BOOK_ID, durationDays: 7 });

      const { startDate, endDate } = valuesOf() as { startDate: Date; endDate: Date };
      expect(startDate.getTime()).toBeGreaterThanOrEqual(startedAt);
      expect(calendarDaysBetween(startDate, endDate)).toBe(7);
    });

    it('falls back to a fourteen-day window when no duration is supplied', async () => {
      // `CreateRentalInput` declares durationDays as required, so the fallback is reachable only
      // from an untyped caller; the default is what the service layer's own default assumes.
      control.queue([{ id: RENTAL_ID }]);

      await repository.create({ userId: USER_ID, bookId: BOOK_ID } as CreateRentalInput);

      const { startDate, endDate } = valuesOf() as { startDate: Date; endDate: Date };
      expect(calendarDaysBetween(startDate, endDate)).toBe(14);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: RENTAL_ID, status: 'returned' }]);

      const updated = await repository.update(RENTAL_ID, { status: 'returned' });

      expect(updated).toMatchObject({ status: 'returned' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'returned' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: RENTAL_ID }]);

      await repository.update(RENTAL_ID, { status: 'active' });

      expect(whereOf()).toEqual(eq(rentals.id, RENTAL_ID));
      expect(db.update).toHaveBeenCalledWith(rentals);
    });
  });

  describe('softDelete', () => {
    it('stamps deletedAt instead of removing the row', async () => {
      control.queue([]);

      await repository.softDelete(RENTAL_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('createExtension', () => {
    it('records the extension against the rental and returns it', async () => {
      const previousEndDate = new Date('2026-03-01T00:00:00.000Z');
      const newEndDate = new Date('2026-03-08T00:00:00.000Z');
      control.queue([{ id: RENTAL_ID, rentalId: RENTAL_ID, extensionDays: 7 }]);

      const extension = await repository.createExtension({
        rentalId: RENTAL_ID,
        previousEndDate,
        newEndDate,
        extensionDays: 7,
      });

      expect(extension).toMatchObject({ extensionDays: 7 });
      expect(db.insert).toHaveBeenCalledWith(rentalExtensions);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { rentalId: RENTAL_ID, previousEndDate, newEndDate, extensionDays: 7 },
      ]);
    });
  });

  describe('findExtensionsByRental', () => {
    it('returns every extension recorded against the rental', async () => {
      control.queue([{ id: RENTAL_ID, extensionDays: 7 }]);

      await expect(repository.findExtensionsByRental(RENTAL_ID)).resolves.toEqual([
        { id: RENTAL_ID, extensionDays: 7 },
      ]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([rentalExtensions]);
      expect(whereOf()).toEqual(eq(rentalExtensions.rentalId, RENTAL_ID));
    });

    it('returns an empty list when the rental was never extended', async () => {
      control.queue([]);

      await expect(repository.findExtensionsByRental(RENTAL_ID)).resolves.toEqual([]);
    });
  });

  describe('findOverdue', () => {
    it('flags rentals whose end date has passed while they are still active', async () => {
      // The `< now` boundary is the current instant, so the clock is frozen to make it assertable.
      vi.useFakeTimers();
      vi.setSystemTime(OVERDUE_CLOCK);
      control.queue([]);

      await repository.findOverdue();

      expect(whereOf()).toEqual(
        and(eq(rentals.status, 'active'), lt(rentals.endDate, OVERDUE_CLOCK), isNull(rentals.deletedAt)),
      );
    });

    it('returns an empty list when nothing is overdue', async () => {
      control.queue([]);

      await expect(repository.findOverdue()).resolves.toEqual([]);
    });
  });
});
