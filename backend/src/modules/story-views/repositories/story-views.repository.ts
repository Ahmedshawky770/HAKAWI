import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { storyViews } from '../../../db/schema/story-views.schema.js';
import { db } from '../../../db/index.js';
import type {
  IStoryViewsRepository,
  StoryView,
  CreateStoryViewData,
} from '../interfaces/story-views-repository.interface.js';

@Injectable()
export class StoryViewsRepository implements IStoryViewsRepository {
  private readonly logger = new Logger(StoryViewsRepository.name);

  private castView = (view: Record<string, unknown>): StoryView => view as unknown as StoryView;

  async create(data: CreateStoryViewData): Promise<StoryView> {
    this.logger.debug(`Creating story view for story: ${data.storyId}`);
    const [view] = await db.insert(storyViews).values(data).returning();
    return this.castView(view);
  }

  async findByStoryId(storyId: string): Promise<StoryView[]> {
    this.logger.debug(`Finding views for story: ${storyId}`);
    const views = await db
      .select()
      .from(storyViews)
      .where(eq(storyViews.storyId, storyId))
      .orderBy(desc(storyViews.createdAt));
    return views.map(v => this.castView(v));
  }

  async findByViewerId(viewerId: string): Promise<StoryView[]> {
    this.logger.debug(`Finding views by viewer: ${viewerId}`);
    const views = await db
      .select()
      .from(storyViews)
      .where(eq(storyViews.viewerId, viewerId))
      .orderBy(desc(storyViews.createdAt));
    return views.map(v => this.castView(v));
  }

  async countByStoryId(storyId: string): Promise<number> {
    this.logger.debug(`Counting views for story: ${storyId}`);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(storyViews)
      .where(eq(storyViews.storyId, storyId));
    return Number(count);
  }
}
