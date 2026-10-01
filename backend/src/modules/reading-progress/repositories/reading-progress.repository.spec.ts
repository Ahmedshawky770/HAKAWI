import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';

import { readingProgress } from '../../../db/schema/books.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { ReadingProgressRepository } from './reading-progress.repository.ts';

// No winston mock: this repository takes no logger and never imports the service, so the
// logger block the other repository specs carry would be an unused hoisted binding.
const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const PROGRESS_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BOOK_ID = '33333333-3333-4333-8333-333333333333';

describe('ReadingProgressRepository', () => {
  let repository: ReadingProgressRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new ReadingProgressRepository();
  });

  describe('findById', () => {
    it('returns the progress row when one matches', async () => {
      control.queue([{ id: PROGRESS_ID, userId: USER_ID, bookId: BOOK_ID, currentPage: 42 }]);

      await expect(repository.findById(PROGRESS_ID)).resolves.toMatchObject({ id: PROGRESS_ID, currentPage: 42 });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('reads a single row from the reading_progress table by primary key', async () => {
      control.queue([{ id: PROGRESS_ID }]);

      await repository.findById(PROGRESS_ID);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([readingProgress]);
      expect(whereOf()).toEqual(eq(readingProgress.id, PROGRESS_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(PROGRESS_ID)).resolves.toBeNull();
    });
  });

  describe('findByUserAndBook', () => {
    it('returns the reader progress for that book', async () => {
      control.queue([{ id: PROGRESS_ID, userId: USER_ID, bookId: BOOK_ID }]);

      await expect(repository.findByUserAndBook(USER_ID, BOOK_ID)).resolves.toMatchObject({ id: PROGRESS_ID });
    });

    it('matches on user and book together so another reader progress row is not returned', async () => {
      control.queue([{ id: PROGRESS_ID }]);

      await repository.findByUserAndBook(USER_ID, BOOK_ID);

      expect(whereOf()).toEqual(and(eq(readingProgress.userId, USER_ID), eq(readingProgress.bookId, BOOK_ID)));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the reader has not started that book', async () => {
      control.queue([]);

      await expect(repository.findByUserAndBook(USER_ID, BOOK_ID)).resolves.toBeNull();
    });
  });

  describe('findByUser', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: PROGRESS_ID }], [{ count: 1 }]);

      await expect(repository.findByUser(USER_ID, {})).resolves.toEqual({
        progress: [{ id: PROGRESS_ID }],
        total: 1,
      });
    });

    it('defaults to the first page of twenty when no pagination is given', async () => {
      control.queue([], [{ count: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('offsets by whole pages for any later page', async () => {
      control.queue([], [{ count: 0 }]);

      await repository.findByUser(USER_ID, { page: 3, limit: 10 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('scopes the page and the count to the reader', async () => {
      control.queue([], [{ count: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(whereOf(0)).toEqual(and(eq(readingProgress.userId, USER_ID)));
      expect(whereOf(1)).toEqual(whereOf(0));
    });

    it('narrows the page and the count to one book when a bookId is given', async () => {
      control.queue([], [{ count: 0 }]);

      await repository.findByUser(USER_ID, { bookId: BOOK_ID });

      const expected = and(eq(readingProgress.userId, USER_ID), eq(readingProgress.bookId, BOOK_ID));
      expect(whereOf(0)).toEqual(expected);
      expect(whereOf(1)).toEqual(expected);
    });

    it('orders most recently read first', async () => {
      control.queue([], [{ count: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(readingProgress.lastReadAt)]);
    });

    it('reads the page from the reading_progress table', async () => {
      control.queue([], [{ count: 0 }]);

      await repository.findByUser(USER_ID, {});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([readingProgress]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ count: '6' }]);

      await expect(repository.findByUser(USER_ID, {})).resolves.toMatchObject({ total: 6 });
    });

    it('returns an empty page and a zero total when the reader has no progress rows', async () => {
      control.queue([], [{ count: 0 }]);

      await expect(repository.findByUser(USER_ID, {})).resolves.toEqual({ progress: [], total: 0 });
    });
  });

  describe('create', () => {
    it('inserts the row and returns the stored progress', async () => {
      control.queue([{ id: PROGRESS_ID, userId: USER_ID, bookId: BOOK_ID }]);

      const created = await repository.create({ userId: USER_ID, bookId: BOOK_ID, currentPage: 10 });

      expect(created).toMatchObject({ id: PROGRESS_ID });
      expect(db.insert).toHaveBeenCalledWith(readingProgress);
    });

    it('opens a fresh book at page zero with an unknown length and no completion', async () => {
      control.queue([{ id: PROGRESS_ID }]);

      await repository.create({ userId: USER_ID, bookId: BOOK_ID });

      // `totalPages` has no useful database default here, so the repository has to write
      // the null explicitly rather than leave the column unset.
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { userId: USER_ID, bookId: BOOK_ID, currentPage: 0, totalPages: null, progressPercentage: 0 },
      ]);
    });

    it('keeps the supplied page, length and percentage instead of the zero defaults', async () => {
      control.queue([{ id: PROGRESS_ID }]);

      await repository.create({
        userId: USER_ID,
        bookId: BOOK_ID,
        currentPage: 120,
        totalPages: 340,
        progressPercentage: 35,
      });

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { userId: USER_ID, bookId: BOOK_ID, currentPage: 120, totalPages: 340, progressPercentage: 35 },
      ]);
    });
  });

  describe('update', () => {
    it('writes the patch and returns the updated row', async () => {
      control.queue([{ id: PROGRESS_ID, currentPage: 200, progressPercentage: 58 }]);

      const updated = await repository.update(PROGRESS_ID, { currentPage: 200, progressPercentage: 58 });

      expect(updated).toMatchObject({ currentPage: 200, progressPercentage: 58 });
      expect(firstArgsOf(chains[0]!, 'set')).toEqual([{ currentPage: 200, progressPercentage: 58 }]);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: PROGRESS_ID }]);

      await repository.update(PROGRESS_ID, { completedAt: new Date(0) });

      expect(whereOf()).toEqual(eq(readingProgress.id, PROGRESS_ID));
      expect(db.update).toHaveBeenCalledWith(readingProgress);
    });
  });

  describe('delete', () => {
    it('removes the row by primary key', async () => {
      control.queue([]);

      await repository.delete(PROGRESS_ID);

      expect(db.delete).toHaveBeenCalledWith(readingProgress);
      expect(whereOf()).toEqual(eq(readingProgress.id, PROGRESS_ID));
    });

    it('issues a single narrow delete', async () => {
      control.queue([]);

      await repository.delete(PROGRESS_ID);

      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });
});
