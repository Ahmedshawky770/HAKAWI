import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq, inArray, isNull, like } from 'drizzle-orm';

import { categories, stories, storyTags, tags } from '../../../db/schema/stories.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { StoriesRepository } from './stories.repository.ts';

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

const STORY_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const AUTHOR_ID = '33333333-3333-4333-8333-333333333333';
const SLUG = 'the-long-night';

describe('StoriesRepository', () => {
  let repository: StoriesRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new StoriesRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the story when one matches', async () => {
      control.queue([{ id: STORY_ID, slug: SLUG }]);

      await expect(repository.findById(STORY_ID)).resolves.toMatchObject({ id: STORY_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(STORY_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(STORY_ID)).rejects.toBe(failure);
    });
  });

  describe('findBySlug', () => {
    it('returns the story matched by slug', async () => {
      control.queue([{ id: STORY_ID, slug: SLUG }]);

      await expect(repository.findBySlug(SLUG)).resolves.toMatchObject({ slug: SLUG });
    });

    it('matches the slug column and reads from the stories table', async () => {
      control.queue([{ id: STORY_ID }]);

      await repository.findBySlug(SLUG);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([stories]);
      expect(whereOf()).toEqual(eq(stories.slug, SLUG));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when no story carries that slug', async () => {
      control.queue([]);

      await expect(repository.findBySlug(SLUG)).resolves.toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: STORY_ID }], [{ total: 1 }]);

      await expect(repository.findAll({})).resolves.toEqual({
        stories: [{ id: STORY_ID }],
        total: 1,
      });
    });

    it('returns an empty page and a zero total when nothing matches', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findAll({ status: 'published' })).resolves.toEqual({ stories: [], total: 0 });
    });

    it('defaults to the first page of twenty with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ page: 4, limit: 10 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([30]);
    });

    it('orders by publication date, newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(stories.publishedAt)]);
    });

    it('hides soft-deleted stories even when no filter is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      // The clause list is never empty here: it always opens with `deleted_at IS NULL`,
      // and `eq(deletedAt, null)` would compile to `deleted_at = NULL` and match nothing.
      expect(whereOf()).toEqual(and(isNull(stories.deletedAt)));
    });

    it('adds one condition per supplied filter', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ authorId: AUTHOR_ID, categoryId: CATEGORY_ID, status: 'published', search: 'night' });

      expect(whereOf()).toEqual(
        and(
          isNull(stories.deletedAt),
          eq(stories.authorId, AUTHOR_ID),
          eq(stories.categoryId, CATEGORY_ID),
          eq(stories.status, 'published'),
          like(stories.title, '%night%'),
        ),
      );
    });

    it('leaves out the filters that were not supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ authorId: AUTHOR_ID });

      expect(whereOf()).toEqual(and(isNull(stories.deletedAt), eq(stories.authorId, AUTHOR_ID)));
    });

    it('uses one shared visibility predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({ authorId: AUTHOR_ID });

      // If the page and the count disagreed, `total` would not match the rows returned.
      expect(whereOf(1)).toBe(whereOf(0));
    });

    it('reads the page from the stories table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAll({});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([stories]);
      expect(firstArgsOf(chains[1]!, 'from')).toEqual([stories]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findAll({})).resolves.toMatchObject({ total: 7 });
    });
  });

  describe('create', () => {
    it('inserts the row and returns the inserted story', async () => {
      control.queue([{ id: STORY_ID, title: 'The Long Night' }]);

      const created = await repository.create({ authorId: AUTHOR_ID, title: 'The Long Night', slug: SLUG });

      expect(created).toMatchObject({ id: STORY_ID });
      expect(db.insert).toHaveBeenCalledWith(stories);
    });

    it('passes the create input through to values unchanged', async () => {
      control.queue([{ id: STORY_ID }]);

      const data = { authorId: AUTHOR_ID, title: 'The Long Night', slug: SLUG, categoryId: CATEGORY_ID };
      await repository.create(data);

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([data]);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: STORY_ID, title: 'Edited' }]);

      const updated = await repository.update(STORY_ID, { title: 'Edited' });

      expect(updated).toMatchObject({ title: 'Edited' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ title: 'Edited' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: STORY_ID }]);

      await repository.update(STORY_ID, { status: 'published' });

      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(whereOf()).toEqual(eq(stories.id, STORY_ID));
      expect(db.update).toHaveBeenCalledWith(stories);
    });
  });

  describe('softDelete', () => {
    it('tombstones the row and archives it instead of removing it', async () => {
      control.queue([]);

      await repository.softDelete(STORY_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'archived' });
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('incrementViewCount', () => {
    it('adds one to the denormalized view count', async () => {
      control.queue([]);

      await repository.incrementViewCount(STORY_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toHaveProperty('viewCount');
      expect(whereOf()).toEqual(eq(stories.id, STORY_ID));
    });
  });

  describe('findAuthorsByIds', () => {
    it('returns the summaries for the requested authors', async () => {
      control.queue([{ id: AUTHOR_ID, name: 'Nadia' }]);

      await expect(repository.findAuthorsByIds([AUTHOR_ID])).resolves.toEqual([{ id: AUTHOR_ID, name: 'Nadia' }]);
    });

    it('reads from the users table and matches every requested id in one predicate', async () => {
      control.queue([]);

      await repository.findAuthorsByIds([AUTHOR_ID, CATEGORY_ID]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([users]);
      expect(whereOf()).toEqual(inArray(users.id, [AUTHOR_ID, CATEGORY_ID]));
    });

    it('short-circuits to an empty array for an empty id list without querying', async () => {
      await expect(repository.findAuthorsByIds([])).resolves.toEqual([]);

      // `inArray(column, [])` compiles to `false`, which is harmless, but a list read
      // assembled for a page of results should not cost a round trip when it is empty.
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('findCategoriesByIds', () => {
    it('returns the summaries for the requested categories', async () => {
      control.queue([{ id: CATEGORY_ID, name: 'Fantasy' }]);

      await expect(repository.findCategoriesByIds([CATEGORY_ID])).resolves.toEqual([
        { id: CATEGORY_ID, name: 'Fantasy' },
      ]);
    });

    it('reads from the categories table and matches every requested id in one predicate', async () => {
      control.queue([]);

      await repository.findCategoriesByIds([CATEGORY_ID]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([categories]);
      expect(whereOf()).toEqual(inArray(categories.id, [CATEGORY_ID]));
    });

    it('short-circuits to an empty array for an empty id list without querying', async () => {
      await expect(repository.findCategoriesByIds([])).resolves.toEqual([]);

      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('findTagsByStoryIds', () => {
    it('returns the tag name for every tag row of the requested stories', async () => {
      control.queue([{ storyId: STORY_ID, name: 'epic' }]);

      await expect(repository.findTagsByStoryIds([STORY_ID])).resolves.toEqual([{ storyId: STORY_ID, name: 'epic' }]);
    });

    it('drives the read from the junction table and joins the tag names onto it', async () => {
      control.queue([]);

      await repository.findTagsByStoryIds([STORY_ID]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([storyTags]);
      expect(firstArgsOf(chains[0]!, 'innerJoin')).toEqual([tags, eq(tags.id, storyTags.tagId)]);
    });

    it('matches the story ids on the junction table, not on the joined tag', async () => {
      control.queue([]);

      await repository.findTagsByStoryIds([STORY_ID, CATEGORY_ID]);

      expect(whereOf()).toEqual(inArray(storyTags.storyId, [STORY_ID, CATEGORY_ID]));
    });

    it('short-circuits to an empty array for an empty story list without querying', async () => {
      await expect(repository.findTagsByStoryIds([])).resolves.toEqual([]);

      expect(db.select).not.toHaveBeenCalled();
    });
  });
});
