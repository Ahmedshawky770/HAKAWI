import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { storyCategories } from '../../../db/schema/story-categories.schema.js';
import { db } from '../../../db/index.js';
import type {
  IStoryCategoriesRepository,
  StoryCategory,
  CreateStoryCategoryData,
  UpdateStoryCategoryData,
} from '../interfaces/story-categories-repository.interface.js';

@Injectable()
export class StoryCategoriesRepository implements IStoryCategoriesRepository {
  private readonly logger = new Logger(StoryCategoriesRepository.name);

  private castCategory = (category: Record<string, unknown>): StoryCategory => category as unknown as StoryCategory;

  async findById(id: string): Promise<StoryCategory | null> {
    this.logger.debug(`Finding story category by id: ${id}`);
    const [category] = await db
      .select()
      .from(storyCategories)
      .where(eq(storyCategories.id, id))
      .limit(1);
    return category ? this.castCategory(category) : null;
  }

  async findByName(name: string): Promise<StoryCategory | null> {
    this.logger.debug(`Finding story category by name: ${name}`);
    const [category] = await db
      .select()
      .from(storyCategories)
      .where(eq(storyCategories.name, name))
      .limit(1);
    return category ? this.castCategory(category) : null;
  }

  async findBySlug(slug: string): Promise<StoryCategory | null> {
    this.logger.debug(`Finding story category by slug: ${slug}`);
    const [category] = await db
      .select()
      .from(storyCategories)
      .where(eq(storyCategories.slug, slug))
      .limit(1);
    return category ? this.castCategory(category) : null;
  }

  async findAll(): Promise<StoryCategory[]> {
    this.logger.debug('Finding all story categories');
    const categories = await db.select().from(storyCategories).orderBy(asc(storyCategories.name));
    return categories.map(c => this.castCategory(c));
  }

  async create(data: CreateStoryCategoryData): Promise<StoryCategory> {
    this.logger.log(`Creating story category: ${data.name}`);
    const [category] = await db
      .insert(storyCategories)
      .values(data)
      .returning();
    return this.castCategory(category);
  }

  async update(
    id: string,
    data: Partial<UpdateStoryCategoryData>,
  ): Promise<StoryCategory> {
    this.logger.debug(`Updating story category: ${id}`);
    const [category] = await db
      .update(storyCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(storyCategories.id, id))
      .returning();
    return this.castCategory(category);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting story category: ${id}`);
    await db.delete(storyCategories).where(eq(storyCategories.id, id));
  }
}
