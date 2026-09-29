import { Injectable } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';

import { db } from '../../../db/index.ts';
import { readingProgress } from '../../../db/schema/books.schema.ts';
import type { IReadingProgressRepository, ReadingProgress, CreateReadingProgressInput, UpdateReadingProgressInput } from '../interfaces/reading-progress-repository.interface.ts';

@Injectable()
export class ReadingProgressRepository implements IReadingProgressRepository {
  async findById(id: string): Promise<ReadingProgress | null> {
    const result = await db.select().from(readingProgress).where(eq(readingProgress.id, id)).limit(1);
    return result[0] ?? null;
  }

  async findByUserAndBook(userId: string, bookId: string): Promise<ReadingProgress | null> {
    const result = await db.select().from(readingProgress).where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, bookId))).limit(1);
    return result[0] ?? null;
  }

  async findByUser(userId: string, params: { bookId?: string; page?: number; limit?: number }): Promise<{ progress: ReadingProgress[]; total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(readingProgress.userId, userId)];
    if (params.bookId) {
      conditions.push(eq(readingProgress.bookId, params.bookId));
    }

    const whereClause = and(...conditions);
    const data = await db.select().from(readingProgress).where(whereClause).orderBy(desc(readingProgress.lastReadAt)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: readingProgress.id }).from(readingProgress).where(whereClause);

    return { progress: data, total: Number(count) };
  }

  async create(data: CreateReadingProgressInput): Promise<ReadingProgress> {
    const result = await db.insert(readingProgress).values({
      userId: data.userId,
      bookId: data.bookId,
      currentPage: data.currentPage ?? 0,
      totalPages: data.totalPages ?? null,
      progressPercentage: data.progressPercentage ?? 0,
    }).returning();
    return result[0];
  }

  async update(id: string, data: UpdateReadingProgressInput): Promise<ReadingProgress> {
    const result = await db.update(readingProgress).set(data).where(eq(readingProgress.id, id)).returning();
    return result[0];
  }

  async delete(id: string): Promise<void> {
    await db.delete(readingProgress).where(eq(readingProgress.id, id));
  }
}
