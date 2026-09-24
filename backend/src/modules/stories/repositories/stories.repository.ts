import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, like, count, sql } from 'drizzle-orm';

import { IStoriesRepository, Story, CreateStoryInput, UpdateStoryInput } from '../interfaces/stories-repository.interface.ts';
import { stories } from '../../../db/schema/stories.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class StoriesRepository implements IStoriesRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Story | null> {
    this.logger.debug(`Finding story by id: ${id}`);
    try {
      const [story] = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
      return story ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findBySlug(slug: string): Promise<Story | null> {
    this.logger.debug(`Finding story by slug: ${slug}`);
    const [story] = await db.select().from(stories).where(eq(stories.slug, slug)).limit(1);
    return story ?? null;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    authorId?: string;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<{ stories: Story[]; total: number }> {
    this.logger.debug('Finding all stories');
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(stories.deletedAt, null as unknown as Date)];

    if (params.authorId) {
      conditions.push(eq(stories.authorId, params.authorId));
    }
    if (params.categoryId) {
      conditions.push(eq(stories.categoryId, params.categoryId));
    }
    if (params.status) {
      conditions.push(eq(stories.status, params.status));
    }
    if (params.search) {
      conditions.push(like(stories.title, `%${params.search}%`));
    }

    const whereClause = and(...conditions);

    const [storiesResult, [{ total }]] = await Promise.all([
      db.select().from(stories).where(whereClause).orderBy(desc(stories.publishedAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(stories).where(whereClause),
    ]);

    return { stories: storiesResult, total: Number(total) };
  }

  async create(data: CreateStoryInput): Promise<Story> {
    this.logger.info(`Creating story with title: ${data.title}`);
    const [story] = await db.insert(stories).values(data).returning();
    return story;
  }

  async update(id: string, data: UpdateStoryInput): Promise<Story> {
    this.logger.debug(`Updating story: ${id}`);
    const [story] = await db.update(stories).set({ ...data, updatedAt: new Date() }).where(eq(stories.id, id)).returning();
    return story;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting story: ${id}`);
    await db.update(stories).set({ deletedAt: new Date(), status: 'archived' }).where(eq(stories.id, id));
  }

  async incrementViewCount(id: string): Promise<void> {
    this.logger.debug(`Incrementing view count for story: ${id}`);
    await db.update(stories).set({ viewCount: sql`${stories.viewCount} + 1` }).where(eq(stories.id, id));
  }
}
