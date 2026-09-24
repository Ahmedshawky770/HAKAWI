import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ITagsRepository, Tag, CreateTagInput, UpdateTagInput } from '../interfaces/tags-repository.interface.ts';
import { tags } from '../../../db/schema/stories.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class TagsRepository implements ITagsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Tag | null> {
    this.logger.debug(`Finding tag by id: ${id}`);
    const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    return tag ?? null;
  }

  async findBySlug(slug: string): Promise<Tag | null> {
    this.logger.debug(`Finding tag by slug: ${slug}`);
    const [tag] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
    return tag ?? null;
  }

  async findAll(): Promise<Tag[]> {
    this.logger.debug('Finding all tags');
    return db.select().from(tags).orderBy(tags.name);
  }

  async create(data: CreateTagInput): Promise<Tag> {
    this.logger.info(`Creating tag: ${data.name}`);
    const [tag] = await db.insert(tags).values(data).returning();
    return tag;
  }

  async update(id: string, data: UpdateTagInput): Promise<Tag> {
    this.logger.debug(`Updating tag: ${id}`);
    const [tag] = await db.update(tags).set(data).where(eq(tags.id, id)).returning();
    return tag;
  }
}
