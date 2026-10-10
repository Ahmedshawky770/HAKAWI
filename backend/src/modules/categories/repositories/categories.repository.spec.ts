import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { categories } from '../../../db/schema/stories.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { CategoriesRepository } from './categories.repository.ts';

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

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const NAME = 'Folklore';
const SLUG = 'folklore';

describe('CategoriesRepository', () => {
  let repository: CategoriesRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new CategoriesRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the category when one matches', async () => {
      control.queue([{ id: CATEGORY_ID, name: NAME, slug: SLUG }]);

      await expect(repository.findById(CATEGORY_ID)).resolves.toMatchObject({ id: CATEGORY_ID, name: NAME });

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([categories]);
      expect(whereOf()).toEqual(eq(categories.id, CATEGORY_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(CATEGORY_ID)).resolves.toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('looks the category up on the slug column, not the primary key', async () => {
      control.queue([{ id: CATEGORY_ID, slug: SLUG }]);

      await expect(repository.findBySlug(SLUG)).resolves.toMatchObject({ id: CATEGORY_ID });
      expect(whereOf()).toEqual(eq(categories.slug, SLUG));
    });

    it('returns null when no category carries that slug', async () => {
      control.queue([]);

      await expect(repository.findBySlug(SLUG)).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns every category in the curated display order', async () => {
      // Navigation renders categories in editorial order, not alphabetical, so sortOrder
      // has to drive the listing.
      control.queue([{ id: CATEGORY_ID, name: NAME, sortOrder: 2 }]);

      await expect(repository.findAll()).resolves.toEqual([{ id: CATEGORY_ID, name: NAME, sortOrder: 2 }]);
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([categories]);
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([categories.sortOrder]);
    });
  });

  describe('create', () => {
    it('inserts the supplied fields and returns the stored category', async () => {
      control.queue([{ id: CATEGORY_ID, name: NAME, slug: SLUG }]);

      const created = await repository.create({ name: NAME, slug: SLUG, description: 'Old tales', sortOrder: 3 });

      expect(created).toMatchObject({ id: CATEGORY_ID });
      expect(db.insert).toHaveBeenCalledWith(categories);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { name: NAME, slug: SLUG, description: 'Old tales', sortOrder: 3 },
      ]);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: CATEGORY_ID, name: 'Folk Tales' }]);

      const updated = await repository.update(CATEGORY_ID, { name: 'Folk Tales' });

      expect(updated).toMatchObject({ name: 'Folk Tales' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ name: 'Folk Tales' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
      expect(whereOf()).toEqual(eq(categories.id, CATEGORY_ID));
    });
  });

  describe('softDelete', () => {
    it('deactivates the row instead of removing it', async () => {
      // Stories keep their category foreign key, so a hard delete would orphan them.
      control.queue([]);

      await repository.softDelete(CATEGORY_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toEqual({ isActive: false });
      expect(whereOf()).toEqual(eq(categories.id, CATEGORY_ID));
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
