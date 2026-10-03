import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';

import { library } from '../../../db/schema/library.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { LibraryRepository } from './library.repository.ts';

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

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BOOK_ID = '33333333-3333-4333-8333-333333333333';
const RENTAL_ID = '44444444-4444-4444-8444-444444444444';

describe('LibraryRepository', () => {
  let repository: LibraryRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new LibraryRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the item when one matches', async () => {
      control.queue([{ id: ITEM_ID, userId: USER_ID, bookId: BOOK_ID }]);

      await expect(repository.findById(ITEM_ID)).resolves.toMatchObject({ id: ITEM_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('reads a single row from the library table by primary key', async () => {
      control.queue([{ id: ITEM_ID }]);

      await repository.findById(ITEM_ID);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([library]);
      expect(whereOf()).toEqual(eq(library.id, ITEM_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(ITEM_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(ITEM_ID)).rejects.toBe(failure);
    });
  });

  describe('findByUser', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: ITEM_ID }], [{ total: 1 }]);

      await expect(repository.findByUser(USER_ID, {})).resolves.toEqual({ items: [{ id: ITEM_ID }], total: 1 });
    });

    it('defaults to the first page of twenty when no pagination is given', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('offsets by whole pages for any later page', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, { page: 3, limit: 10 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('scopes every read to the owner so nobody sees another shelf', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(whereOf(0)).toEqual(and(eq(library.userId, USER_ID)));
      expect(whereOf(1)).toEqual(whereOf(0));
    });

    it('narrows the page and the count to the requested status when one is given', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, { status: 'rented' });

      const expected = and(eq(library.userId, USER_ID), eq(library.status, 'rented'));
      expect(whereOf(0)).toEqual(expected);
      expect(whereOf(1)).toEqual(expected);
    });

    it('leaves the status predicate out entirely when no status is requested', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, {});

      // `and()` with a lone condition must not invent a status comparison of its own.
      expect(whereOf()).toEqual(and(eq(library.userId, USER_ID)));
    });

    it('orders most recently added first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(library.addedAt)]);
    });

    it('reads from the library table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([library]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '15' }]);

      await expect(repository.findByUser(USER_ID, {})).resolves.toMatchObject({ total: 15 });
    });

    it('returns an empty page and a zero total for an empty shelf', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findByUser(USER_ID, {})).resolves.toEqual({ items: [], total: 0 });
    });
  });

  describe('findByUserAndBook', () => {
    it('returns the shelf entry for that user and book', async () => {
      control.queue([{ id: ITEM_ID, userId: USER_ID, bookId: BOOK_ID }]);

      await expect(repository.findByUserAndBook(USER_ID, BOOK_ID)).resolves.toMatchObject({ id: ITEM_ID });
    });

    it('matches on user and book together so another reader’s copy is not returned', async () => {
      control.queue([{ id: ITEM_ID }]);

      await repository.findByUserAndBook(USER_ID, BOOK_ID);

      expect(whereOf()).toEqual(and(eq(library.userId, USER_ID), eq(library.bookId, BOOK_ID)));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the book is not on that reader’s shelf', async () => {
      control.queue([]);

      await expect(repository.findByUserAndBook(USER_ID, BOOK_ID)).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('inserts the row and returns the stored item', async () => {
      control.queue([{ id: ITEM_ID, userId: USER_ID, bookId: BOOK_ID }]);

      const created = await repository.create({ userId: USER_ID, bookId: BOOK_ID });

      expect(created).toMatchObject({ id: ITEM_ID });
      expect(db.insert).toHaveBeenCalledWith(library);
    });

    it('records an owned copy with no rental behind it when the optional fields are omitted', async () => {
      // `rentalId` is nullable but `status` is not, so the default has to be written by the
      // repository rather than left to `values({ userId, bookId })` alone.
      control.queue([{ id: ITEM_ID }]);

      await repository.create({ userId: USER_ID, bookId: BOOK_ID });

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { userId: USER_ID, bookId: BOOK_ID, rentalId: null, status: 'owned' },
      ]);
    });

    it('keeps a supplied rental and status instead of overwriting them with the defaults', async () => {
      control.queue([{ id: ITEM_ID }]);

      await repository.create({ userId: USER_ID, bookId: BOOK_ID, rentalId: RENTAL_ID, status: 'rented' });

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { userId: USER_ID, bookId: BOOK_ID, rentalId: RENTAL_ID, status: 'rented' },
      ]);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: ITEM_ID, status: 'read' }]);

      const updated = await repository.update(ITEM_ID, { status: 'read' });

      expect(updated).toMatchObject({ status: 'read' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'read' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: ITEM_ID }]);

      await repository.update(ITEM_ID, { lastAccessedAt: new Date(0) });

      expect(whereOf()).toEqual(eq(library.id, ITEM_ID));
      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(db.update).toHaveBeenCalledWith(library);
    });
  });

  describe('delete', () => {
    it('removes the row by primary key', async () => {
      control.queue([]);

      await repository.delete(ITEM_ID);

      expect(db.delete).toHaveBeenCalledWith(library);
      expect(whereOf()).toEqual(eq(library.id, ITEM_ID));
    });

    it('issues a single narrow delete', async () => {
      control.queue([]);

      await repository.delete(ITEM_ID);

      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByUser', () => {
    it('counts every shelf entry the reader owns', async () => {
      control.queue([{ total: 8 }]);

      await expect(repository.countByUser(USER_ID)).resolves.toBe(8);

      expect(whereOf()).toEqual(eq(library.userId, USER_ID));
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '4' }]);

      await expect(repository.countByUser(USER_ID)).resolves.toBe(4);
    });
  });
});
