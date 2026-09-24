import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ICategoriesRepository, Category, CreateCategoryInput, UpdateCategoryInput } from '../interfaces/categories-repository.interface.ts';
import { categories } from '../../../db/schema/stories.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class CategoriesRepository implements ICategoriesRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Category | null> {
    this.logger.debug(`Finding category by id: ${id}`);
    const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return category ?? null;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    this.logger.debug(`Finding category by slug: ${slug}`);
    const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    return category ?? null;
  }

  async findAll(): Promise<Category[]> {
    this.logger.debug('Finding all categories');
    return db.select().from(categories).orderBy(categories.sortOrder);
  }

  async create(data: CreateCategoryInput): Promise<Category> {
    this.logger.info(`Creating category: ${data.name}`);
    const [category] = await db.insert(categories).values(data).returning();
    return category;
  }

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    this.logger.debug(`Updating category: ${id}`);
    const [category] = await db.update(categories).set({ ...data, updatedAt: new Date() }).where(eq(categories.id, id)).returning();
    return category;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting category: ${id}`);
    await db.update(categories).set({ isActive: false }).where(eq(categories.id, id));
  }
}
