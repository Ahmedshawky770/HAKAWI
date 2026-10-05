import { Injectable, Inject } from '@nestjs/common';
import { sql, desc, eq, and, isNull, type SQL } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { db } from '../../../db/index.ts';
import { stories, categories, tags, storyTags } from '../../../db/schema/stories.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
import type { SearchSortField } from '../dto/search.dto.ts';
import type {
  ISearchRepository,
  SearchResult,
  AuthorSearchResult,
  CategorySearchResult,
} from '../interfaces/search-repository.interface.ts';

interface StorySearchRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  category: string | null;
  views: number;
  reactions: number;
  /** Aggregated by the query; `{}` for a story with no tags. */
  tagNames: string[] | null;
  createdAt: Date;
  author: { id: string; name: string } | null;
}

interface AuthorSearchRow {
  id: string;
  name: string;
  storiesCount: number;
}

interface CategorySearchRow {
  id: string;
  name: string;
  slug: string;
  storiesCount: number;
}

/**
 * The one author-search predicate, shared by the page query and the count query.
 *
 * WHY A SHARED FUNCTION AND NOT TWO IDENTICAL `sql` TEMPLATES (Principle #9 — Single Source of
 * Truth): the tsvector configuration is part of the *predicate*, not a detail of one query. The two
 * sides of `searchAuthors` used to spell the same predicate with different configurations — 'simple'
 * for the page, 'english' for the count — and that divergence was invisible: both queries ran, both
 * returned, and nothing failed. It broke the method twice over:
 *
 *  - `total` no longer described the rows returned. Stemming changes which terms match, so a term
 *    the page matched was not matched by the count (or the reverse). Pagination then reported a last
 *    page that did not exist, or stopped short of the rows that did.
 *  - 'english' is not the expression `users_search_idx` is built on in
 *    `migrations/0014_create_search_indexes.sql`, which uses 'simple'. A GIN expression index is
 *    only usable when the query's expression matches the indexed one, so the count query could not
 *    use the index the migration created for it.
 *
 * WHY 'simple' SPECIFICALLY, AND NOT 'english': this index set covers an Arabic corpus as well as an
 * English one, and the Snowball 'english' stemmer discards the case-folding and diacritic handling
 * Arabic needs while stemming English words that were never indexed as such. 'simple' is what the
 * applied migrations already build, and Principle #6 forbids a migration purely to change a value
 * that a code change can align instead.
 *
 * WHY 'simple' IS WRITTEN AS A LITERAL IN THE SQL TEXT RATHER THAN BOUND AS A PARAMETER: Postgres
 * matches an expression index by comparing the query's expression tree against the indexed one, and
 * a bound parameter is opaque at that point. `websearch_to_tsquery($1, $2)` with the configuration
 * supplied as a bind would parse, run, and then scan the table instead of using `users_search_idx`.
 * So the one name lives here, in the one predicate, spelled out.
 */
const searchAuthorsPredicate = (query: string): SQL =>
  sql`to_tsvector('simple', ${users.name}) @@ websearch_to_tsquery('simple', ${query})`;

/**
 * The indexed document expression, spelled ONCE, used by both the predicate and the ranking.
 *
 * WHY IT IS A NAMED FUNCTION RATHER THAN A TEMPLATE INLINED TWICE. `migrations/0014_create_search_indexes.sql`
 * builds `stories_search_idx` on `to_tsvector('simple', title || ' ' || COALESCE(excerpt, ''))`, and
 * Postgres will only use a GIN expression index when the query's expression tree matches the indexed
 * one. A second, separately written copy of that expression is exactly how the same divergence
 * documented on `searchAuthorsPredicate` got introduced in the first place — both copies compiled,
 * both returned rows, and only one of them was the indexed one. So the ranking cannot be allowed to
 * spell its own.
 *
 * WHY 'simple' AND WHY IT IS A LITERAL, not a bind: same reasoning as `searchAuthorsPredicate` — the
 * configuration has to be part of the parsed expression for the index to match, and 'english' would
 * also mis-stem the Arabic half of this corpus.
 */
const storyDocument = sql`to_tsvector('simple', ${stories.title} || ' ' || COALESCE(${stories.excerpt}, ''))`;

/**
 * The `tsquery` for a search term, built once and used by both the predicate and the ranking.
 *
 * WHY ONE FRAGMENT AND NOT THE STRING TWICE. The predicate and the ranking have to lex the term with
 * the same configuration, and that is precisely the divergence documented on `searchAuthorsPredicate`
 * — the page said 'simple', the count said 'english', both ran, and only `total` was wrong. Building
 * the tsquery once means a future change to term normalisation has exactly one place to change.
 *
 * WHY THE TERM IS STILL BOUND TWICE. Drizzle renders an interpolated `sql` fragment independently at
 * each position and renumbers binds per statement, so the ranking necessarily carries its own copy of
 * the term. That is harmless — the value is identical — and it is the reason `storyOrderBy` refuses to
 * rank without a term: a rank over a tsquery that is not in the WHERE clause would describe a
 * different document set than the one being paged.
 */
const storyTsQuery = (term: string): SQL => sql`websearch_to_tsquery('simple', ${term})`;

/**
 * The single `ORDER BY` for every story search, as a function of the sort field and whether a search
 * term exists.
 *
 * WHY RELEVANCE IS `ts_rank_cd` AND NOT THE `created_at` FALL-THROUGH IT USED TO BE. `sortBy`
 * defaulted to `'relevance'` in `SearchService` and `relevance` is listed first in
 * `SEARCH_SORT_FIELDS`, so "search returns relevant results" was a documented, defaulted behaviour
 * that no code implemented — there is no `ts_rank` anywhere in `backend/src`, and the default sort
 * silently ordered by recency. Every user who asked for the best match got the newest document.
 *
 * `ts_rank_cd` (cover density) rather than `ts_rank`: `ts_rank` counts how often a term occurs and
 * is largely monotone in document length, so a long story outranks a short exact match. `ts_rank_cd`
 * also rewards proximity, which is the whole reason a reader searching for a phrase expects the story
 * containing the phrase together to come first. Ranking over `storyDocument` — the indexed
 * expression — is what makes the sort affordable: the GIN index already materialises that tsvector
 * per row, so the rank reuses it instead of re-lexing `title` and `excerpt` for every row.
 *
 * WHY `created_at DESC` IS THE SECOND KEY. `ts_rank_cd` returns a float and ties are common — every
 * row that matches the tsquery equally scores equally. Without a deterministic second key, `LIMIT` +
 * `OFFSET` may return the same row on two pages or skip one entirely, which is a pagination bug
 * rather than a cosmetic one.
 *
 * WHY RELEVANCE WITHOUT A SEARCH TERM IS RECENCY, NOT ZERO. `GET /search?category=fiction` is a
 * legitimate browse call with no `query`, and there is no tsquery to be relevant to; `ts_rank_cd`
 * over an empty query is a constant, so ranking on it would make the sort a no-op that looks like an
 * answer. Recency is the honest reading of "no relevance signal available", and it is the same
 * answer an unrecognised sort field gets.
 *
 * WHY `date` IS `NULLS LAST` RATHER THAN A BARE `desc(published_at)`. Postgres orders NULLs FIRST
 * under `DESC` and LAST under `ASC` — the opposite of what a reader expects from a descending date
 * list. `published_at` is NULL for every draft and every archived story (`migrations/0001`), so the
 * oldest-looking rows sorted to the very top of "newest first". Drizzle's `SQL` exposes no
 * `nullsLast()` builder (its `Column.nullsLast()` configures an INDEX, not an `ORDER BY`), so the
 * clause is written out.
 */
function storyOrderBy(sortBy: SearchSortField, term: string | undefined): SQL {
  switch (sortBy) {
    case 'views':
      return desc(stories.viewCount);
    case 'reactions':
      return desc(stories.likeCount);
    case 'date':
      return sql`${stories.publishedAt} desc nulls last`;
    case 'relevance':
      return term === undefined
        ? desc(stories.createdAt)
        : sql`ts_rank_cd(${storyDocument}, ${storyTsQuery(term)}) desc, ${stories.createdAt} desc`;
  }
}

@Injectable()
export class SearchRepository implements ISearchRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async searchStories(filters: {
    query?: string;
    category?: string;
    tag?: string;
    authorId?: string;
    status?: string;
    page: number;
    limit: number;
    sortBy: SearchSortField;
  }): Promise<{ results: SearchResult[]; total: number }> {
    this.logger.debug('Searching stories');
    const offset = (filters.page - 1) * filters.limit;

    const conditions = [isNull(stories.deletedAt)];

    if (filters.query) {
      conditions.push(sql`${storyDocument} @@ ${storyTsQuery(filters.query)}`);
    }

    if (filters.category) {
      conditions.push(eq(categories.slug, filters.category));
    }

    if (filters.tag) {
      conditions.push(eq(tags.slug, filters.tag));
    }

    if (filters.authorId) {
      conditions.push(eq(stories.authorId, filters.authorId));
    }

    if (filters.status) {
      conditions.push(eq(stories.status, filters.status));
    }

    const whereClause = and(...conditions);
    // Resolved ONCE and handed to both the predicate and the ranking, so the rows being ranked are
    // provably the rows being paged. The truthiness test is deliberately the same one the predicate
    // uses: an empty term means "browse by filter", and ranking on a term that was not matched
    // against anything would order a result set the tsquery never described.
    const term = filters.query ? filters.query : undefined;
    const orderBy = storyOrderBy(filters.sortBy, term);

    const [results, [{ total }]] = await Promise.all([
      db
        .select({
          id: stories.id,
          title: stories.title,
          slug: stories.slug,
          excerpt: stories.excerpt,
          status: stories.status,
          category: categories.name,
          views: stories.viewCount,
          reactions: stories.likeCount,
          // Aggregated in the same projection as the rest of the row rather than in a second
          // query per story. `tags` was hardcoded to `[]` while the `storyTags`/`tags` joins sat
          // right there in this same FROM clause — the joins were present solely to filter, so
          // every search result advertised no tags even when the story had several.
          //
          // `array_remove(..., NULL)` drops the single NULL that a LEFT JOIN produces for a story
          // with no tags, so the projection is `{}` rather than `{NULL}`. The `FILTER` does the same
          // job without the post-hoc array cleanup, and `array_agg` over a GROUP BY row cannot
          // reintroduce the multiplication the page query's `groupBy(stories.id, …)` already prevents.
          tagNames: sql<string[]>`coalesce(array_agg(${tags.name}) FILTER (WHERE ${tags.id} IS NOT NULL), '{}')`,
          createdAt: stories.createdAt,
          author: {
            id: users.id,
            name: users.name,
          },
        })
        .from(stories)
        .leftJoin(categories, eq(categories.id, stories.categoryId))
        .leftJoin(users, eq(users.id, stories.authorId))
        .leftJoin(storyTags, eq(storyTags.storyId, stories.id))
        .leftJoin(tags, eq(tags.id, storyTags.tagId))
        .where(whereClause)
        .groupBy(stories.id, categories.id, users.id)
        .orderBy(orderBy)
        .limit(filters.limit)
        .offset(offset),
      db
        // WHY `count(distinct stories.id)` AND NOT `count(*)`. The four LEFT JOINs are shared with
        // the page query, which is correct — the `whereClause` references `categories.slug` and
        // `tags.slug`, so dropping the joins from the count would produce invalid SQL. But they
        // multiply rows: a story with three tags is three rows here, so `count(*)` reported 3 for a
        // one-story result and pagination then advertised pages that do not exist. The page query
        // does not have this problem because it groups by `stories.id`.
        .select({ total: sql<number>`count(distinct ${stories.id})` })
        .from(stories)
        .leftJoin(categories, eq(categories.id, stories.categoryId))
        .leftJoin(users, eq(users.id, stories.authorId))
        .leftJoin(storyTags, eq(storyTags.storyId, stories.id))
        .leftJoin(tags, eq(tags.id, storyTags.tagId))
        .where(whereClause),
    ]);

    return {
      results: results.map((row: StorySearchRow) => {
        const author = row.author ?? { id: '', name: '' };
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          excerpt: row.excerpt,
          status: row.status,
          category: row.category,
          tags: row.tagNames ?? [],
          author,
          views: row.views,
          reactions: row.reactions,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      total: Number(total),
    };
  }

  async searchAuthors(
    query: string,
    page: number,
    limit: number,
  ): Promise<{ authors: AuthorSearchResult[]; total: number }> {
    this.logger.debug(`Searching authors: ${query}`);
    const offset = (page - 1) * limit;

    const [authors, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          storiesCount: sql<number>`count(${stories.id})`,
        })
        .from(users)
        .leftJoin(stories, eq(stories.authorId, users.id))
        .where(and(searchAuthorsPredicate(query), isNull(users.deletedAt)))
        .groupBy(users.id, users.name)
        .orderBy(desc(sql<number>`count(${stories.id})`))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(users)
        .where(and(searchAuthorsPredicate(query), isNull(users.deletedAt))),
    ]);

    return {
      authors: authors.map((author: AuthorSearchRow) => ({
        id: author.id,
        name: author.name,
        storiesCount: Number(author.storiesCount),
      })),
      total: Number(total),
    };
  }

  async searchCategories(query: string): Promise<CategorySearchResult[]> {
    this.logger.debug(`Searching categories: ${query}`);

    const results = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        storiesCount: sql<number>`count(${stories.id})`,
      })
      .from(categories)
      .leftJoin(stories, eq(stories.categoryId, categories.id))
      .where(
        and(
          sql`to_tsvector('simple', ${categories.name}) @@ websearch_to_tsquery('simple', ${query})`,
          eq(categories.isActive, true),
        ),
      )
      .groupBy(categories.id, categories.name, categories.slug)
      .orderBy(desc(sql<number>`count(${stories.id})`))
      .limit(10);

    return results.map((result: CategorySearchRow) => ({
      id: result.id,
      name: result.name,
      slug: result.slug,
      storiesCount: Number(result.storiesCount),
    }));
  }
}
