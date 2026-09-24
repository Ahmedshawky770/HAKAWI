import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, like, count, sql } from 'drizzle-orm';

import { IBooksRepository, Book, CreateBookInput, UpdateBookInput } from '../interfaces/books-repository.interface.ts';
import { BOOKS_REPOSITORY } from '../interfaces/books-repository.interface.ts';
import { books } from '../../../db/schema/books.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class BooksRepository implements IBooksRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Book | null> {
    this.logger.debug(`Finding book by id: ${id}`);
    try {
      const [book] = await db.select().from(books).where(eq(books.id, id)).limit(1);
      return book ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByIsbn(isbn: string): Promise<Book | null> {
    this.logger.debug(`Finding book by isbn: ${isbn}`);
    const [book] = await db.select().from(books).where(eq(books.isbn, isbn)).limit(1);
    return book ?? null;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
    author?: string;
  }): Promise<{ books: Book[]; total: number }> {
    this.logger.debug('Finding all books');
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(books.deletedAt, null as unknown as Date)];

    if (params.categoryId) {
      conditions.push(eq(books.categoryId, params.categoryId));
    }
    if (params.status) {
      conditions.push(eq(books.status, params.status));
    }
    if (params.author) {
      conditions.push(eq(books.author, params.author));
    }
    if (params.search) {
      conditions.push(like(books.title, `%${params.search}%`));
    }

    const whereClause = and(...conditions);

    const [booksResult, [{ total }]] = await Promise.all([
      db.select().from(books).where(whereClause).orderBy(desc(books.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(books).where(whereClause),
    ]);

    return { books: booksResult, total: Number(total) };
  }

  async create(data: CreateBookInput): Promise<Book> {
    this.logger.info(`Creating book with title: ${data.title}`);
    const [book] = await db.insert(books).values(data).returning();
    return book;
  }

  async update(id: string, data: UpdateBookInput): Promise<Book> {
    this.logger.debug(`Updating book: ${id}`);
    const [book] = await db.update(books).set({ ...data, updatedAt: new Date() }).where(eq(books.id, id)).returning();
    return book;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting book: ${id}`);
    await db.update(books).set({ deletedAt: new Date(), status: 'archived' }).where(eq(books.id, id));
  }

  async incrementViewCount(id: string): Promise<void> {
    this.logger.debug(`Incrementing view count for book: ${id}`);
    await db.update(books).set({ viewCount: sql`${books.viewCount} + 1` }).where(eq(books.id, id));
  }

  async incrementDownloadCount(id: string): Promise<void> {
    this.logger.debug(`Incrementing download count for book: ${id}`);
    await db.update(books).set({ downloadCount: sql`${books.downloadCount} + 1` }).where(eq(books.id, id));
  }

  async findByCategory(categoryId: string): Promise<Book[]> {
    this.logger.debug(`Finding books by category: ${categoryId}`);
    const result = await db.select().from(books).where(and(eq(books.categoryId, categoryId), eq(books.deletedAt, null as unknown as Date)));
    return result;
  }
}
