import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { tags } from '../../../db/schema/stories.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { TagsRepository } from './tags.repository.ts';

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

const TAG_ID = '11111111-1111-4111-8111-111111111111';
const NAME = 'haunted';
const SLUG = 'haunted';

describe('TagsRepository', () => {
  let repository: TagsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new TagsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the tag when one matches', async () => {
      control.queue([{ id: TAG_ID, name: NAME, slug: SLUG }]);

      await expect(repository.findById(TAG_ID)).resolves.toMatchObject({ id: TAG_ID, slug: SLUG });

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([tags]);
      expect(whereOf()).toEqual(eq(tags.id, TAG_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(TAG_ID)).resolves.toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('looks the tag up on the slug column, not the primary key', async () => {
      // Slugs are the public handle in story URLs, so the lookup must be on `slug`.
      control.queue([{ id: TAG_ID, slug: SLUG }]);

      await expect(repository.findBySlug(SLUG)).resolves.toMatchObject({ id: TAG_ID });
      expect(whereOf()).toEqual(eq(tags.slug, SLUG));
    });

    it('returns null when no tag carries that slug', async () => {
      control.queue([]);

      await expect(repository.findBySlug(SLUG)).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns every tag ordered by name', async () => {
      control.queue([{ id: TAG_ID, name: NAME }]);

      await expect(repository.findAll()).resolves.toEqual([{ id: TAG_ID, name: NAME }]);
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([tags]);
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([tags.name]);
    });

    it('returns an empty array when there are no tags', async () => {
      control.queue([]);

      await expect(repository.findAll()).resolves.toEqual([]);
    });
  });

  describe('create', () => {
    it('inserts the name and slug and returns the stored tag', async () => {
      control.queue([{ id: TAG_ID, name: NAME, slug: SLUG }]);

      const created = await repository.create({ name: NAME, slug: SLUG });

      expect(created).toMatchObject({ id: TAG_ID });
      expect(db.insert).toHaveBeenCalledWith(tags);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([{ name: NAME, slug: SLUG }]);
    });
  });

  describe('update', () => {
    it('writes the patch, narrows it to the row, and returns the updated tag', async () => {
      control.queue([{ id: TAG_ID, slug: 'haunted-mansion' }]);

      const updated = await repository.update(TAG_ID, { slug: 'haunted-mansion' });

      expect(updated).toMatchObject({ slug: 'haunted-mansion' });
      expect(firstArgsOf(chains[0]!, 'set')).toEqual([{ slug: 'haunted-mansion' }]);
      expect(whereOf()).toEqual(eq(tags.id, TAG_ID));
      expect(db.update).toHaveBeenCalledWith(tags);
    });
  });
});
