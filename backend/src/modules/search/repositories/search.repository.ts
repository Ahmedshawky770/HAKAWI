import { Injectable, Inject } from '@nestjs/common';
import { sql, desc, eq, and, like } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { db } from '../../../db/index.ts';
import { stories, categories, tags, storyTags } from '../../../db/schema/stories.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
import type { ISearchRepository, SearchResult, AuthorSearchResult, CategorySearchResult } from '../interfaces/search-repository.interface.ts';

interface StorySearchRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  category: string | null;
  views: number;
  reactions: number;
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

    const conditions = [eq(stories.deletedAt, null as unknown as Date)];

    if (filters.query) {
      conditions.push(like(stories.title, `%${filters.query}%`));
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
      db.select({ total: sql<number>`count(*)` }).from(stories)
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
          tags: [],
          author,
          views: row.views,
          reactions: row.reactions,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      total: Number(total),
    };
  }

  async searchAuthors(query: string, page: number, limit: number): Promise<{ authors: AuthorSearchResult[]; total: number }> {
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
        .where(and(like(users.name, `%${query}%`), eq(users.deletedAt, null as unknown as Date)))
        .groupBy(users.id, users.name)
        .orderBy(desc(sql<number>`count(${stories.id})`))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(users).where(and(like(users.name, `%${query}%`), eq(users.deletedAt, null as unknown as Date))),
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
      .where(and(like(categories.name, `%${query}%`), eq(categories.isActive, true)))
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
