import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';

import { ILibraryRepository, LibraryItem } from '../interfaces/library-repository.interface.ts';
import { LIBRARY_REPOSITORY } from '../interfaces/library-repository.interface.ts';
import { library } from '../../../db/schema/library.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class LibraryRepository implements ILibraryRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<LibraryItem | null> {
    this.logger.debug(`Finding library item by id: ${id}`);
    try {
      const [item] = await db.select().from(library).where(eq(library.id, id)).limit(1);
      return item ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUser(userId: string, params: { status?: string; page?: number; limit?: number }): Promise<{ items: LibraryItem[]; total: number }> {
    this.logger.debug(`Finding library items for user: ${userId}`);
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(library.userId, userId)];

    if (params.status) {
      conditions.push(eq(library.status, params.status));
    }

    const whereClause = and(...conditions);

    const [itemsResult, [{ total }]] = await Promise.all([
      db.select().from(library).where(whereClause).orderBy(desc(library.addedAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(library).where(whereClause),
    ]);

    return { items: itemsResult, total: Number(total) };
  }

  async findByUserAndBook(userId: string, bookId: string): Promise<LibraryItem | null> {
    this.logger.debug(`Finding library item by user: ${userId} and book: ${bookId}`);
    const [item] = await db.select().from(library).where(and(eq(library.userId, userId), eq(library.bookId, bookId))).limit(1);
    return item ?? null;
  }

  async create(data: { userId: string; bookId: string; rentalId?: string | null; status?: string }): Promise<LibraryItem> {
    this.logger.info(`Adding book to library for user: ${data.userId}, book: ${data.bookId}`);
    const [item] = await db.insert(library).values({
      userId: data.userId,
      bookId: data.bookId,
      rentalId: data.rentalId ?? null,
      status: data.status ?? 'owned',
    }).returning();
    return item;
  }

  async update(id: string, data: Partial<LibraryItem>): Promise<LibraryItem> {
    this.logger.debug(`Updating library item: ${id}`);
    const [item] = await db.update(library).set({ ...data, updatedAt: new Date() }).where(eq(library.id, id)).returning();
    return item;
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Removing library item: ${id}`);
    await db.delete(library).where(eq(library.id, id));
  }

  async countByUser(userId: string): Promise<number> {
    this.logger.debug(`Counting library items for user: ${userId}`);
    const [{ total }] = await db.select({ total: count() }).from(library).where(eq(library.userId, userId));
    return Number(total);
  }
}
