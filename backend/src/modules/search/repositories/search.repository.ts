import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { stories } from '../../../db/schema/stories.schema.js';
import { storyCategories } from '../../../db/schema/story-categories.schema.js';
import { users } from '../../../db/schema/users.schema.js';
import { db } from '../../../db/index.js';
import type { ISearchRepository, SearchResult, SearchFilters, Story, User, StoryCategory } from '../interfaces/search-repository.interface.js';

@Injectable()
export class SearchRepository implements ISearchRepository {
  private readonly logger = new Logger(SearchRepository.name);

  private castStory = (story: Record<string, unknown>): Story => story as unknown as Story;
  private castUser = (user: Record<string, unknown>): User => user as unknown as User;
  private castCategory = (category: Record<string, unknown>): StoryCategory => category as unknown as StoryCategory;

  async indexStory(story: Story): Promise<void> {
    this.logger.debug(`Indexing story: ${story.id}`);
  }

  async indexUser(user: User): Promise<void> {
    this.logger.debug(`Indexing user: ${user.id}`);
  }

  async removeFromIndex(entityType: string, entityId: string): Promise<void> {
    this.logger.debug(`Removing from index: ${entityType}/${entityId}`);
  }

  async searchStories(query: string, filters: SearchFilters, page: number, limit: number): Promise<SearchResult<Story>> {
    this.logger.debug(`Searching stories: ${query}`);
    const offset = (page - 1) * limit;
    const conditions = [sql`to_tsvector('english', ${stories.title} || ' ' || ${stories.description}) @@ plainto_tsquery('english', ${query})`, eq(stories.status, 'published')];

    if (filters.category) {
      conditions.push(eq(stories.category, filters.category));
    }
    if (filters.author) {
      conditions.push(eq(stories.authorId, filters.author));
    }
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(sql`${stories.tags} && ${filters.tags}::text[]`);
    }
    if (filters.status) {
      conditions.push(eq(stories.status, filters.status));
    }

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(stories).where(and(...conditions));
    const items = await db.select().from(stories).where(and(...conditions)).orderBy(desc(stories.createdAt)).limit(limit).offset(offset);

    return { items: items.map(i => this.castStory(i)), total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) };
  }

  async searchUsers(query: string, page: number, limit: number): Promise<SearchResult<User>> {
    this.logger.debug(`Searching users: ${query}`);
    const offset = (page - 1) * limit;
    const conditions = [sql`to_tsvector('english', ${users.name} || ' ' || ${users.username} || ' ' || ${users.bio}) @@ plainto_tsquery('english', ${query})`];

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(...conditions));
    const items = await db.select().from(users).where(and(...conditions)).orderBy(desc(users.createdAt)).limit(limit).offset(offset);

    return { items: items.map(i => this.castUser(i)), total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) };
  }

  async searchCategories(query: string, page: number, limit: number): Promise<SearchResult<StoryCategory>> {
    this.logger.debug(`Searching categories: ${query}`);
    const offset = (page - 1) * limit;
    const conditions = [sql`to_tsvector('english', ${storyCategories.name} || ' ' || ${storyCategories.description}) @@ plainto_tsquery('english', ${query})`];

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(storyCategories).where(and(...conditions));
    const items = await db.select().from(storyCategories).where(and(...conditions)).orderBy(asc(storyCategories.name)).limit(limit).offset(offset);

    return { items: items.map(i => this.castCategory(i)), total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) };
  }

  async getSuggestions(query: string, limit: number): Promise<string[]> {
    this.logger.debug(`Getting suggestions: ${query}`);
    const results = await db.select({ title: stories.title }).from(stories).where(and(sql`to_tsvector('english', ${stories.title}) @@ plainto_tsquery('english', ${query})`, eq(stories.status, 'published'))).limit(limit);
    return results.map(r => r.title as string);
  }
}
