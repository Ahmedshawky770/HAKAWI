import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { books } from '../../../db/schema/books.schema.js';
import { db } from '../../../db/index.js';
import type {
  IBooksRepository,
  Book,
  CreateBookData,
  UpdateBookData,
  BookFilters,
} from '../interfaces/books-repository.interface.js';

@Injectable()
export class BooksRepository implements IBooksRepository {
  private readonly logger = new Logger(BooksRepository.name);

  async findById(id: string): Promise<Book | null> {
    this.logger.debug(`Finding book by id: ${id}`);
    const [book] = await db
      .select()
      .from(books)
      .where(eq(books.id, id))
      .limit(1);
    return book ?? null;
  }

  async findByOwnerId(ownerId: string): Promise<Book[]> {
    this.logger.debug(`Finding books by owner: ${ownerId}`);
    return db
      .select()
      .from(books)
      .where(eq(books.ownerId, ownerId))
      .orderBy(desc(books.createdAt));
  }

  async findPublished(filters: BookFilters): Promise<Book[]> {
    this.logger.debug('Finding published books with filters');
    const conditions = [
      eq(books.isAvailable, true),
      sql`${books.deletedAt} IS NULL`,
    ];

    if (filters.author) {
      conditions.push(eq(books.authorName, filters.author));
    }
    if (filters.minPrice !== undefined) {
      conditions.push(sql`${books.price} >= ${filters.minPrice}`);
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(sql`${books.price} <= ${filters.maxPrice}`);
    }

    let query = db
      .select()
      .from(books)
      .where(and(...conditions))
      .orderBy(desc(books.createdAt));

    const offset = ((filters.page ?? 1) - 1) * (filters.limit ?? 20);
    return query.limit(filters.limit ?? 20).offset(offset);
  }

  async search(query: string): Promise<Book[]> {
    this.logger.debug(`Searching books: ${query}`);
    return db
      .select()
      .from(books)
      .where(
        and(
          sql`to_tsvector('english', ${books.title} || ' ' || ${books.authorName}) @@ plainto_tsquery('english', ${query})`,
          eq(books.isAvailable, true),
        ),
      );
  }

  async create(data: CreateBookData): Promise<Book> {
    this.logger.info(`Creating book: ${data.title}`);
    const [book] = await db.insert(books).values(data).returning();
    return book;
  }

  async update(id: string, data: Partial<UpdateBookData>): Promise<Book> {
    this.logger.debug(`Updating book: ${id}`);
    const [book] = await db
      .update(books)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning();
    return book;
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Soft deleting book: ${id}`);
    await db
      .update(books)
      .set({ deletedAt: new Date() })
      .where(eq(books.id, id));
  }

  async findMany(filters: BookFilters): Promise<Book[]> {
    this.logger.debug('Finding books with filters');
    const conditions: Parameters<typeof and>[0][] = [
      sql`${books.deletedAt} IS NULL`,
    ];

    if (filters.author) {
      conditions.push(eq(books.authorName, filters.author));
    }
    if (filters.minPrice !== undefined) {
      conditions.push(sql`${books.price} >= ${filters.minPrice}`);
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(sql`${books.price} <= ${filters.maxPrice}`);
    }

    let query = db
      .select()
      .from(books)
      .where(and(...conditions))
      .orderBy(desc(books.createdAt));

    const offset = ((filters.page ?? 1) - 1) * (filters.limit ?? 20);
    return query.limit(filters.limit ?? 20).offset(offset);
  }

  async count(filters: BookFilters): Promise<number> {
    this.logger.debug('Counting books with filters');
    const conditions: Parameters<typeof and>[0][] = [
      sql`${books.deletedAt} IS NULL`,
    ];

    if (filters.author) {
      conditions.push(eq(books.authorName, filters.author));
    }
    if (filters.minPrice !== undefined) {
      conditions.push(sql`${books.price} >= ${filters.minPrice}`);
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(sql`${books.price} <= ${filters.maxPrice}`);
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .where(and(...conditions));
    return Number(count);
  }
}
