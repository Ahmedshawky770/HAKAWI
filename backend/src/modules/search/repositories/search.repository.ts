import { Injectable, Inject } from '@nestjs/common';
import { sql, desc, eq, and, isNull, type SQL } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { db } from '../../../db/index.ts';
import { stories, categories, tags, storyTags } from '../../../db/schema/stories.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
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
    sortBy: string;
  }): Promise<{ results: SearchResult[]; total: number }> {
    this.logger.debug('Searching stories');
    const offset = (filters.page - 1) * filters.limit;

    const conditions = [isNull(stories.deletedAt)];

    if (filters.query) {
      conditions.push(
        sql`to_tsvector('simple', ${stories.title} || ' ' || COALESCE(${stories.excerpt}, '')) @@ websearch_to_tsquery('simple', ${filters.query})`,
      );
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

    let orderBy = desc(stories.createdAt);
    if (filters.sortBy === 'views') {
      orderBy = desc(stories.viewCount);
    } else if (filters.sortBy === 'reactions') {
      orderBy = desc(stories.likeCount);
    } else if (filters.sortBy === 'date') {
      orderBy = desc(stories.publishedAt);
    }

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
