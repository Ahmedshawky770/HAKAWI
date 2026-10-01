import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq, isNull, like } from 'drizzle-orm';

import { books } from '../../../db/schema/books.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { BooksRepository } from './books.repository.ts';

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

const BOOK_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const ISBN = '978-0-00-000000-1';

describe('BooksRepository', () => {
  let repository: BooksRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new BooksRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the book when one matches', async () => {
      control.queue([{ id: BOOK_ID, isbn: ISBN }]);

      await expect(repository.findById(BOOK_ID)).resolves.toMatchObject({ id: BOOK_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(BOOK_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(BOOK_ID)).rejects.toBe(failure);
    });
  });

  describe('findByIsbn', () => {
    it('returns the book matched by isbn', async () => {
      control.queue([{ id: BOOK_ID, isbn: ISBN }]);

      await expect(repository.findByIsbn(ISBN)).resolves.toMatchObject({ isbn: ISBN });
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([books]);
    });

    it('matches the isbn column rather than a cast of it', async () => {
      control.queue([{ id: BOOK_ID }]);

      await repository.findByIsbn(ISBN);

      expect(whereOf()).toEqual(eq(books.isbn, ISBN));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when no book carries that isbn', async () => {
      control.queue([]);

      await expect(repository.findByIsbn(ISBN)).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: BOOK_ID }], [{ total: 1 }]);

      await expect(repository.findAll({})).resolves.toEqual({
        books: [{ id: BOOK_ID }],
        total: 1,
      });
    });

    it('returns an empty page and a zero total when nothing matches', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findAll({ categoryId: CATEGORY_ID })).resolves.toEqual({ books: [], total: 0 });
    });

    it('defaults to the first page of twenty with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ page: 3, limit: 10 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('orders newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(books.createdAt)]);
    });

    it('hides soft-deleted books even when no filter is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      // `deleted_at IS NULL` has to survive as the only condition; dropping it would
      // re-expose tombstoned books in every listing.
      expect(whereOf()).toEqual(and(isNull(books.deletedAt)));
    });

    it('adds one condition per supplied filter', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({
        categoryId: CATEGORY_ID,
        status: 'published',
        author: 'Frank Herbert',
        search: 'dune',
      });

      expect(whereOf()).toEqual(
        and(
          isNull(books.deletedAt),
          eq(books.categoryId, CATEGORY_ID),
          eq(books.status, 'published'),
          eq(books.author, 'Frank Herbert'),
          like(books.title, '%dune%'),
        ),
      );
    });

    it('leaves out the filters that were not supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ status: 'published' });

      expect(whereOf()).toEqual(and(isNull(books.deletedAt), eq(books.status, 'published')));
    });

    it('uses one shared visibility predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ categoryId: CATEGORY_ID });

      // If the page and the count disagreed, `total` would not match the rows returned.
      expect(whereOf(1)).toBe(whereOf(0));
    });

    it('reads the page from the books table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([books]);
      expect(firstArgsOf(chains[1]!, 'from')).toEqual([books]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findAll({})).resolves.toMatchObject({ total: 7 });
    });
  });

  describe('create', () => {
    it('inserts the row and returns the inserted book', async () => {
      control.queue([{ id: BOOK_ID, title: 'Dune' }]);

      const created = await repository.create({ title: 'Dune', author: 'Frank Herbert' });

      expect(created).toMatchObject({ id: BOOK_ID });
      expect(db.insert).toHaveBeenCalledWith(books);
    });

    it('passes the create input through to values unchanged', async () => {
      control.queue([{ id: BOOK_ID }]);

      const data = { title: 'Dune', author: 'Frank Herbert', isbn: ISBN, categoryId: CATEGORY_ID, isFree: false };
      await repository.create(data);

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([data]);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: BOOK_ID, status: 'archived' }]);

      const updated = await repository.update(BOOK_ID, { status: 'archived' });

      expect(updated).toMatchObject({ status: 'archived' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'archived' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: BOOK_ID }]);

      await repository.update(BOOK_ID, { status: 'published' });

      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(whereOf()).toEqual(eq(books.id, BOOK_ID));
      expect(db.update).toHaveBeenCalledWith(books);
    });
  });

  describe('softDelete', () => {
    it('tombstones the row and archives it instead of removing it', async () => {
      control.queue([]);

      await repository.softDelete(BOOK_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'archived' });
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('incrementViewCount', () => {
    it('adds one to the denormalized view count and nothing else', async () => {
      control.queue([]);

      await repository.incrementViewCount(BOOK_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toHaveProperty('viewCount');
      expect(patch).not.toHaveProperty('downloadCount');
      expect(whereOf()).toEqual(eq(books.id, BOOK_ID));
    });
  });

  describe('incrementDownloadCount', () => {
    it('adds one to the denormalized download count and nothing else', async () => {
      control.queue([]);

      await repository.incrementDownloadCount(BOOK_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toHaveProperty('downloadCount');
      expect(patch).not.toHaveProperty('viewCount');
      expect(whereOf()).toEqual(eq(books.id, BOOK_ID));
    });
  });

  describe('findByCategory', () => {
    it('returns the live books in the category', async () => {
      control.queue([{ id: BOOK_ID, categoryId: CATEGORY_ID }]);

      await expect(repository.findByCategory(CATEGORY_ID)).resolves.toEqual([{ id: BOOK_ID, categoryId: CATEGORY_ID }]);
    });

    it('excludes soft-deleted books from the category listing', async () => {
      control.queue([]);

      await repository.findByCategory(CATEGORY_ID);

      expect(whereOf()).toEqual(and(eq(books.categoryId, CATEGORY_ID), isNull(books.deletedAt)));
    });

    it('returns an empty array when the category has no books', async () => {
      control.queue([]);

      await expect(repository.findByCategory(CATEGORY_ID)).resolves.toEqual([]);
    });

    it('does not promise an order for a category listing', async () => {
      control.queue([]);

      await repository.findByCategory(CATEGORY_ID);

      expect(callsOf(chains[0]!, 'orderBy')).toHaveLength(0);
    });
  });
});
