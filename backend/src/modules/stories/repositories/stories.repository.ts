import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { stories } from '../../../db/schema/stories.schema.js';
import { db } from '../../../db/index.js';
import type {
  IStoriesRepository,
  Story,
  CreateStoryData,
  UpdateStoryData,
  StoryFilters,
} from '../interfaces/stories-repository.interface.js';

@Injectable()
export class StoriesRepository implements IStoriesRepository {
  private readonly logger = new Logger(StoriesRepository.name);

  private castStory = (story: Record<string, unknown>): Story => story as unknown as Story;

  async findById(id: string): Promise<Story | null> {
    this.logger.debug(`Finding story by id: ${id}`);
    const [story] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, id))
      .limit(1);
    return story ? this.castStory(story) : null;
  }

  async findByAuthorId(authorId: string): Promise<Story[]> {
    this.logger.debug(`Finding stories by author: ${authorId}`);
    const results = await db
      .select()
      .from(stories)
      .where(eq(stories.authorId, authorId))
      .orderBy(desc(stories.createdAt));
    return results.map(s => this.castStory(s));
  }

  async findByCategory(category: string): Promise<Story[]> {
    this.logger.debug(`Finding stories by category: ${category}`);
    const results = await db
      .select()
      .from(stories)
      .where(
        and(eq(stories.category, category), eq(stories.status, 'published')),
      );
    return results.map(s => this.castStory(s));
  }

  async search(query: string): Promise<Story[]> {
    this.logger.debug(`Searching stories: ${query}`);
    const results = await db
      .select()
      .from(stories)
      .where(
        and(
          sql`to_tsvector('english', ${stories.title} || ' ' || ${stories.description}) @@ plainto_tsquery('english', ${query})`,
          eq(stories.status, 'published'),
        ),
      );
    return results.map(s => this.castStory(s));
  }

  async findPublished(filters: StoryFilters): Promise<Story[]> {
    this.logger.debug('Finding published stories with filters');
    const conditions: Parameters<typeof and>[0][] = [eq(stories.status, 'published')];

    if (filters.category) {
      conditions.push(eq(stories.category, filters.category));
    }
    if (filters.authorId) {
      conditions.push(eq(stories.authorId, filters.authorId));
    }
    if (filters.status) {
      conditions.push(eq(stories.status, filters.status));
    }

    const baseQuery = db.select().from(stories).where(and(...conditions));

    if (filters.sortBy && filters.sortOrder) {
      const orderFn = filters.sortOrder === 'asc' ? asc : desc;
      const sortableColumns = ['createdAt', 'publishedAt', 'views'] as const;
      if (sortableColumns.includes(filters.sortBy as typeof sortableColumns[number])) {
        const column = stories[filters.sortBy as 'createdAt' | 'publishedAt' | 'views'];
        if (column) {
          baseQuery.orderBy(orderFn(column));
        }
      }
    } else {
      baseQuery.orderBy(desc(stories.createdAt));
    }

    const offset = ((filters.page ?? 1) - 1) * (filters.limit ?? 20);
    const results = await baseQuery.limit(filters.limit ?? 20).offset(offset);
    return results.map((s: Record<string, unknown>) => this.castStory(s));
  }

  async update(id: string, data: Partial<UpdateStoryData>): Promise<Story> {
    this.logger.debug(`Updating story: ${id}`);
    const [story] = await db
      .update(stories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stories.id, id))
      .returning();
    return this.castStory(story);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Soft deleting story: ${id}`);
    await db
      .update(stories)
      .set({ deletedAt: new Date() })
      .where(eq(stories.id, id));
  }

  async incrementViews(id: string): Promise<void> {
    this.logger.debug(`Incrementing views for story: ${id}`);
    await db
      .update(stories)
      .set({ views: sql`${stories.views} + 1` })
      .where(eq(stories.id, id));
  }

  async findMany(filters: StoryFilters): Promise<Story[]> {
    this.logger.debug('Finding stories with filters');
    const conditions: Parameters<typeof and>[0][] = [];

    if (filters.category) {
      conditions.push(eq(stories.category, filters.category));
    }
    if (filters.authorId) {
      conditions.push(eq(stories.authorId, filters.authorId));
    }
    if (filters.status) {
      conditions.push(eq(stories.status, filters.status));
    }

    const baseQuery = db.select().from(stories);

    if (conditions.length > 0) {
      baseQuery.where(and(...conditions));
    }

    if (filters.sortBy && filters.sortOrder) {
      const orderFn = filters.sortOrder === 'asc' ? asc : desc;
      const sortableColumns = ['createdAt', 'publishedAt', 'views'] as const;
      if (sortableColumns.includes(filters.sortBy as typeof sortableColumns[number])) {
        const column = stories[filters.sortBy as 'createdAt' | 'publishedAt' | 'views'];
        if (column) {
          baseQuery.orderBy(orderFn(column));
        }
      }
    } else {
      baseQuery.orderBy(desc(stories.createdAt));
    }

    const offset = ((filters.page ?? 1) - 1) * (filters.limit ?? 20);
    const results = await baseQuery.limit(filters.limit ?? 20).offset(offset);
    return results.map((s: Record<string, unknown>) => this.castStory(s));
  }

  async count(filters: StoryFilters): Promise<number> {
    this.logger.debug('Counting stories with filters');
    const conditions: Parameters<typeof and>[0][] = [];

    if (filters.category) {
      conditions.push(eq(stories.category, filters.category));
    }
    if (filters.authorId) {
      conditions.push(eq(stories.authorId, filters.authorId));
    }
    if (filters.status) {
      conditions.push(eq(stories.status, filters.status));
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(stories)
      .where(and(...conditions));
    return Number(count);
  }

  async create(data: CreateStoryData): Promise<Story> {
    this.logger.info(`Creating story: ${data.title}`);
    const [story] = await db.insert(stories).values(data).returning();
    return this.castStory(story);
  }
}