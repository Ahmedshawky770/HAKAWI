import { describe, it, expect, beforeEach, vi } from 'vitest';
import { desc, eq, sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { stories, categories, tags, storyTags } from '../../../db/schema/stories.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { SearchRepository } from './search.repository.ts';

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
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const TAG_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_AT = new Date('2026-02-03T04:05:06.000Z');

/** One row as the story select projects it, with the joined fields filled in. */
const STORY_ROW = {
  id: STORY_ID,
  title: 'A Tale of Two Cities',
  slug: 'a-tale-of-two-cities',
  excerpt: 'It was the best of times',
  status: 'published',
  category: 'Classics',
  views: 12,
  reactions: 3,
  createdAt: CREATED_AT,
  author: { id: AUTHOR_ID, name: 'Nour' },
};

const dialect = new PgDialect();

describe('SearchRepository', () => {
  let repository: SearchRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  /**
   * Renders the nth `where` clause to the statement Postgres would receive.
   *
   * The visibility rules here are hand-written `sql` fragments interleaved with column
   * comparisons, so a Drizzle object comparison cannot show which bind values actually reached
   * the driver. Rendering the clause does.
   */
  const sqlOf = (index = 0): { sql: string; params: unknown[] } => dialect.sqlToQuery(whereOf(index) as SQL);

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new SearchRepository(logger as never);
  });

  describe('searchStories', () => {
    it('returns the page and the total', async () => {
      control.queue([STORY_ROW], [{ total: 1 }]);

      await expect(
        repository.searchStories({ query: 'cities', page: 1, limit: 20, sortBy: 'relevance' }),
      ).resolves.toMatchObject({ total: 1 });
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('maps the selected columns and serialises createdAt', async () => {
      control.queue([STORY_ROW], [{ total: 1 }]);

      const { results } = await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      expect(results[0]).toMatchObject({
        id: STORY_ID,
        title: STORY_ROW.title,
        slug: STORY_ROW.slug,
        excerpt: STORY_ROW.excerpt,
        status: 'published',
        category: 'Classics',
        views: 12,
        reactions: 3,
        author: { id: AUTHOR_ID, name: 'Nour' },
        createdAt: CREATED_AT.toISOString(),
      });
    });

    it('returns an empty page when nothing matches', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' })).resolves.toEqual({
        results: [],
        total: 0,
      });
    });

    it('substitutes an empty author when the story has no joined user row', async () => {
      control.queue([{ ...STORY_ROW, author: null }], [{ total: 1 }]);

      const { results } = await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      // A left join misses to null, and the response contract wants an author object, not a hole.
      expect(results[0]?.author).toEqual({ id: '', name: '' });
    });

    it('reports an empty tag list, because the tag join is never projected into the select', async () => {
      control.queue([STORY_ROW], [{ total: 1 }]);

      const { results } = await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      expect(results[0]?.tags).toEqual([]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '9' }]);

      await expect(repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' })).resolves.toMatchObject({
        total: 9,
      });
    });

    it('hides soft-deleted stories even when no other filter is given', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      expect(sqlOf().sql).toContain('"stories"."deleted_at" is null');
    });

    it('drops an empty search term instead of matching nothing', async () => {
      // An empty term is the "browse by filter" case: turning it into a tsquery would return zero rows.
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ query: '', page: 1, limit: 20, sortBy: 'relevance' });

      const { sql, params } = sqlOf();
      expect(sql).not.toContain('websearch_to_tsquery');
      expect(params).toEqual([]);
    });

    it('binds the search term and searches the title and the excerpt', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ query: 'cities', page: 1, limit: 20, sortBy: 'relevance' });

      const { sql, params } = sqlOf();
      expect(sql).toContain('"stories"."title"');
      expect(sql).toContain('COALESCE("stories"."excerpt", \'\')');
      expect(sql).toContain("websearch_to_tsquery('simple', $1)");
      expect(params).toEqual(['cities']);
    });

    it('adds one bound predicate per supplied filter, on top of the soft-delete guard', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({
        query: 'cities',
        category: 'classics',
        tag: 'romance',
        authorId: AUTHOR_ID,
        status: 'published',
        page: 1,
        limit: 20,
        sortBy: 'relevance',
      });

      const { sql, params } = sqlOf();
      expect(sql).toContain('"categories"."slug" = $2');
      expect(sql).toContain('"tags"."slug" = $3');
      expect(sql).toContain('"stories"."author_id" = $4');
      expect(sql).toContain('"stories"."status" = $5');
      expect(params).toEqual(['cities', 'classics', 'romance', AUTHOR_ID, 'published']);
    });

    it('uses one shared predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ query: 'cities', page: 1, limit: 20, sortBy: 'relevance' });

      // A count built from a different clause would report a total the page cannot deliver.
      expect(whereOf(1)).toBe(whereOf(0));
    });

    it('joins categories, the author, and the tag bridge on both queries', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      const joined = [categories, users, storyTags, tags];
      for (const index of [0, 1]) {
        expect(callsOf(chains[index]!, 'leftJoin').map((call) => call.args[0])).toEqual(joined);
      }
    });

    it('groups the page but not the count, so a multi-tag story is not repeated', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      expect(firstArgsOf(chains[0]!, 'groupBy')).toEqual([stories.id, categories.id, users.id]);
      expect(firstArgsOf(chains[1]!, 'groupBy')).toBeUndefined();
    });

    it('paginates the first page from offset zero', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates a later page from the requested limit', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchStories({ page: 5, limit: 10, sortBy: 'relevance' });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([40]);
    });

    it('orders by creation date for the relevance sort and for an unknown one', async () => {
      control.queue([], [{ total: 0 }], [], [{ total: 0 }]);

      await repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' });
      await repository.searchStories({ page: 1, limit: 20, sortBy: 'nonsense' });

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(stories.createdAt)]);
      expect(firstArgsOf(chains[2]!, 'orderBy')).toEqual([desc(stories.createdAt)]);
    });

    it('orders by the requested metric for each named sort', async () => {
      control.queue([], [{ total: 0 }], [], [{ total: 0 }], [], [{ total: 0 }]);

      await repository.searchStories({ page: 1, limit: 20, sortBy: 'views' });
      await repository.searchStories({ page: 1, limit: 20, sortBy: 'reactions' });
      await repository.searchStories({ page: 1, limit: 20, sortBy: 'date' });

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(stories.viewCount)]);
      expect(firstArgsOf(chains[2]!, 'orderBy')).toEqual([desc(stories.likeCount)]);
      expect(firstArgsOf(chains[4]!, 'orderBy')).toEqual([desc(stories.publishedAt)]);
    });

    it('rethrows a database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.searchStories({ page: 1, limit: 20, sortBy: 'relevance' })).rejects.toBe(failure);
    });
  });

  describe('searchAuthors', () => {
    it('returns the page and the total, with the story count as a number', async () => {
      control.queue([{ id: AUTHOR_ID, name: 'Nour', storiesCount: '3' }], [{ total: 1 }]);

      await expect(repository.searchAuthors('nour', 1, 20)).resolves.toEqual({
        authors: [{ id: AUTHOR_ID, name: 'Nour', storiesCount: 3 }],
        total: 1,
      });
    });

    it('returns an empty page when nobody matches', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.searchAuthors('nour', 1, 20)).resolves.toEqual({ authors: [], total: 0 });
    });

    it('binds the term and hides soft-deleted authors from the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('nour', 1, 20);

      for (const index of [0, 1]) {
        const { sql, params } = sqlOf(index);
        expect(sql).toContain('websearch_to_tsquery');
        expect(sql).toContain('"users"."deleted_at" is null');
        expect(params).toEqual(['nour']);
      }
    });

    it('stems the page and the count with the same tsvector configuration', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('running', 1, 20);

      // The defect this guards: the page used 'simple' and the count used 'english'. Both queries
      // ran and both returned, so nothing failed — but `total` counted rows the page could not
      // deliver (or missed rows it could), and 'english' is not the expression `users_search_idx`
      // is built on in migrations/0014_create_search_indexes.sql, so the count could not use it.
      // Asserting equality of the whole clause, not of one string inside it, means the test also
      // fails if a second difference between the two sides is ever introduced.
      expect(sqlOf(1).sql).toBe(sqlOf(0).sql);

      // And pinned to the configuration the applied migration indexed, so a change here has to be a
      // deliberate one against migrations/0014 rather than a quiet divergence from it.
      expect(sqlOf(0).sql).toContain('to_tsvector(\'simple\', "users"."name")');
      expect(sqlOf(0).sql).toContain("websearch_to_tsquery('simple', $1)");
      expect(sqlOf(1).sql).toContain('to_tsvector(\'simple\', "users"."name")');
      expect(sqlOf(1).sql).toContain("websearch_to_tsquery('simple', $1)");
    });

    it('names the tsvector configuration as a literal, not a bind, so the expression index stays usable', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('nour', 1, 20);

      // Postgres matches an expression index by comparing expression trees. A configuration passed
      // as $2 would parse and run, then fall back to a sequential scan.
      for (const index of [0, 1]) {
        const { sql, params } = sqlOf(index);
        expect(params).toEqual(['nour']);
        expect(sql).not.toContain("'simple', $1) @@");
      }
    });

    it('never builds the author count with the english stemmer', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('nour', 1, 20);

      for (const index of [0, 1]) {
        expect(sqlOf(index).sql).not.toContain('english');
      }
    });

    it('groups by author and orders by how many stories each has', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('nour', 1, 20);

      expect(firstArgsOf(chains[0]!, 'leftJoin')).toEqual([stories, eq(stories.authorId, users.id)]);
      expect(firstArgsOf(chains[0]!, 'groupBy')).toEqual([users.id, users.name]);
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(sql<number>`count(${stories.id})`)]);
    });

    it('paginates the first page from offset zero', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('nour', 1, 20);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates a later page from the requested limit', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.searchAuthors('nour', 3, 10);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('coerces a total delivered as text to a number', async () => {
      control.queue([], [{ total: '5' }]);

      await expect(repository.searchAuthors('nour', 1, 20)).resolves.toMatchObject({ total: 5 });
    });

    it('rethrows a database error', async () => {
      const failure = Object.assign(new Error('syntax error'), { code: '42601' });
      control.queueRejection(failure);

      await expect(repository.searchAuthors('nour', 1, 20)).rejects.toBe(failure);
    });
  });

  describe('searchCategories', () => {
    it('returns each match with its story count as a number', async () => {
      control.queue([{ id: CATEGORY_ID, name: 'Classics', slug: 'classics', storiesCount: '4' }]);

      await expect(repository.searchCategories('clas')).resolves.toEqual([
        { id: CATEGORY_ID, name: 'Classics', slug: 'classics', storiesCount: 4 },
      ]);
    });

    it('returns an empty list when nothing matches', async () => {
      control.queue([]);

      await expect(repository.searchCategories('clas')).resolves.toEqual([]);
    });

    it('binds the term and counts only active categories', async () => {
      control.queue([]);

      await repository.searchCategories('clas');

      const { sql, params } = sqlOf();
      expect(sql).toContain('"categories"."name"');
      expect(sql).toContain('"categories"."is_active"');
      expect(params).toEqual(['clas', true]);
    });

    it('reads from the categories table, grouped and capped at ten rows', async () => {
      control.queue([]);

      await repository.searchCategories('clas');

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([categories]);
      expect(firstArgsOf(chains[0]!, 'leftJoin')).toEqual([stories, eq(stories.categoryId, categories.id)]);
      expect(firstArgsOf(chains[0]!, 'groupBy')).toEqual([categories.id, categories.name, categories.slug]);
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(sql<number>`count(${stories.id})`)]);
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
    });

    it('rethrows a database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.searchCategories('clas')).rejects.toBe(failure);
    });
  });
});
