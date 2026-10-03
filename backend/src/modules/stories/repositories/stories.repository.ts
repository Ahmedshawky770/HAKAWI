import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { eq, and, desc, like, count, sql, isNull, inArray } from 'drizzle-orm';

import {
  IStoriesRepository,
  Story,
  CreateStoryInput,
  UpdateStoryInput,
  StoryAuthorSummary,
  StoryCategorySummary,
  StoryTagSummary,
} from '../interfaces/stories-repository.interface.ts';
import { stories, categories, storyTags, tags } from '../../../db/schema/stories.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
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

    const conditions = [isNull(stories.deletedAt)];

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
    const [story] = await db
      .update(stories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stories.id, id))
      .returning();
    return story;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting story: ${id}`);
    await db.update(stories).set({ deletedAt: new Date(), status: 'archived' }).where(eq(stories.id, id));
  }

  async incrementViewCount(id: string): Promise<void> {
    this.logger.debug(`Incrementing view count for story: ${id}`);
    await db
      .update(stories)
      .set({ viewCount: sql`${stories.viewCount} + 1` })
      .where(eq(stories.id, id));
  }

  async incrementLikeCount(id: string): Promise<void> {
    this.logger.debug(`Incrementing like count for story: ${id}`);
    await db
      .update(stories)
      .set({ likeCount: sql`${stories.likeCount} + 1` })
      .where(eq(stories.id, id));
  }

  /**
   * `greatest(..., 0)` rather than a bare `- 1`. A removal that arrives without a matching
   * increment — a retried delete, a row imported by hand — would otherwise drive the counter
   * negative, and `sortBy=reactions` in the search repository would then sort that story above every
   * story anyone has actually read. The floor is what makes the counter safe to derive from the
   * reactions table rather than recomputed from it.
   */
  async decrementLikeCount(id: string): Promise<void> {
    this.logger.debug(`Decrementing like count for story: ${id}`);
    await db
      .update(stories)
      .set({ likeCount: sql`greatest(${stories.likeCount} - 1, 0)` })
      .where(eq(stories.id, id));
  }

  async incrementCommentCount(id: string): Promise<void> {
    this.logger.debug(`Incrementing comment count for story: ${id}`);
    await db
      .update(stories)
      .set({ commentCount: sql`${stories.commentCount} + 1` })
      .where(eq(stories.id, id));
  }

  /** `greatest(..., 0)` for the same reason as `decrementLikeCount` above. */
  async decrementCommentCount(id: string): Promise<void> {
    this.logger.debug(`Decrementing comment count for story: ${id}`);
    await db
      .update(stories)
      .set({ commentCount: sql`greatest(${stories.commentCount} - 1, 0)` })
      .where(eq(stories.id, id));
  }

  async findAuthorsByIds(authorIds: string[]): Promise<StoryAuthorSummary[]> {
    if (authorIds.length === 0) {
      return [];
    }
    this.logger.debug(`Finding ${authorIds.length} story authors`);
    return db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds));
  }

  async findCategoriesByIds(categoryIds: string[]): Promise<StoryCategorySummary[]> {
    if (categoryIds.length === 0) {
      return [];
    }
    this.logger.debug(`Finding ${categoryIds.length} story categories`);
    return db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(inArray(categories.id, categoryIds));
  }

  async findTagsByStoryIds(storyIds: string[]): Promise<StoryTagSummary[]> {
    if (storyIds.length === 0) {
      return [];
    }
    this.logger.debug(`Finding tags for ${storyIds.length} stories`);
    return db
      .select({ storyId: storyTags.storyId, name: tags.name })
      .from(storyTags)
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(inArray(storyTags.storyId, storyIds));
  }

  /**
   * Replaces a story's tag set in one transaction.
   *
   * WHY A TRANSACTION AND NOT TWO STATEMENTS. `story_tags`' primary key is `(story_id, tag_id)`. A
   * delete-then-insert pair outside a transaction opens a window in which a concurrent reader sees a
   * story with no tags, and a failure between the two leaves it with none permanently — while the
   * API still answers 200, because the write that failed was the second one.
   *
   * WHY AN UNKNOWN NAME IS A 400 AND NOT A SILENT NO-OP. The DTO accepts and validates `tags`, so a
   * caller that sent a name the taxonomy does not have has been told the field is understood. Dropping
   * it quietly is how this defect stayed invisible for so long: nothing 400'd, nothing 500'd, and the
   * tags simply were not there.
   *
   * WHY NAMES ARE NOT AUTO-CREATED. `tags.slug` carries a plain index, not a unique one
   * (`migrations/0001_create_stories_tables.sql`), so a get-or-create would race two concurrent
   * requests into two rows with the same name and make the taxonomy ambiguous. Creating tags is an
   * administrative act, so the writer resolves names that already exist and refuses the rest — which
   * also keeps this change additive and migration-free.
   */
  async replaceTags(storyId: string, names: readonly string[]): Promise<void> {
    if (names.length === 0) {
      await db.delete(storyTags).where(eq(storyTags.storyId, storyId));
      return;
    }

    const resolved = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(inArray(tags.name, [...names]));

    const byName = new Map(resolved.map((tag: { id: string; name: string }) => [tag.name, tag.id]));
    const missing = names.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown tag${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Tags are created by an administrator.`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(storyTags).where(eq(storyTags.storyId, storyId));
      await tx.insert(storyTags).values(names.map((name) => ({ storyId, tagId: byName.get(name) as string })));
    });
  }
}
