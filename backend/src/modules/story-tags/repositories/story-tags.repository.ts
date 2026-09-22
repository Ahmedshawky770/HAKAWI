import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { storyTags } from '../../../db/schema/story-tags.schema.js';
import { db } from '../../../db/index.js';
import type {
  IStoryTagsRepository,
  StoryTag,
  CreateStoryTagData,
} from '../interfaces/story-tags-repository.interface.js';

@Injectable()
export class StoryTagsRepository implements IStoryTagsRepository {
  private readonly logger = new Logger(StoryTagsRepository.name);

  async findById(id: string): Promise<StoryTag | null> {
    this.logger.debug(`Finding story tag by id: ${id}`);
    const [tag] = await db
      .select()
      .from(storyTags)
      .where(eq(storyTags.id, id))
      .limit(1);
    return tag ?? null;
  }

  async findByName(name: string): Promise<StoryTag | null> {
    this.logger.debug(`Finding story tag by name: ${name}`);
    const [tag] = await db
      .select()
      .from(storyTags)
      .where(eq(storyTags.name, name))
      .limit(1);
    return tag ?? null;
  }

  async findBySlug(slug: string): Promise<StoryTag | null> {
    this.logger.debug(`Finding story tag by slug: ${slug}`);
    const [tag] = await db
      .select()
      .from(storyTags)
      .where(eq(storyTags.slug, slug))
      .limit(1);
    return tag ?? null;
  }

  async findAll(): Promise<StoryTag[]> {
    this.logger.debug('Finding all story tags');
    return db.select().from(storyTags).orderBy(asc(storyTags.name));
  }

  async create(data: CreateStoryTagData): Promise<StoryTag> {
    this.logger.info(`Creating story tag: ${data.name}`);
    const [tag] = await db.insert(storyTags).values(data).returning();
    return tag;
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting story tag: ${id}`);
    await db.delete(storyTags).where(eq(storyTags.id, id));
  }
}
