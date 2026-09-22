import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { bookSales } from '../../../db/schema/book-sales.schema.js';
import { db } from '../../../db/index.js';
import type {
  IBookSalesRepository,
  BookSale,
  CreateBookSaleData,
} from '../interfaces/book-sales-repository.interface.js';

@Injectable()
export class BookSalesRepository implements IBookSalesRepository {
  private readonly logger = new Logger(BookSalesRepository.name);

  async findById(id: string): Promise<BookSale | null> {
    this.logger.debug(`Finding book sale by id: ${id}`);
    const [sale] = await db
      .select()
      .from(bookSales)
      .where(eq(bookSales.id, id))
      .limit(1);
    return sale ?? null;
  }

  async findByTransactionId(transactionId: string): Promise<BookSale | null> {
    this.logger.debug(`Finding book sale by transaction id: ${transactionId}`);
    const [sale] = await db
      .select()
      .from(bookSales)
      .where(eq(bookSales.id, transactionId))
      .limit(1);
    return sale ?? null;
  }

  async findByBookId(bookId: string): Promise<BookSale[]> {
    this.logger.debug(`Finding book sales by book: ${bookId}`);
    return db
      .select()
      .from(bookSales)
      .where(eq(bookSales.bookId, bookId))
      .orderBy(desc(bookSales.purchasedAt));
  }

  async findByBuyerId(buyerId: string): Promise<BookSale[]> {
    this.logger.debug(`Finding book sales by buyer: ${buyerId}`);
    return db
      .select()
      .from(bookSales)
      .where(eq(bookSales.buyerId, buyerId))
      .orderBy(desc(bookSales.purchasedAt));
  }

  async findBySellerId(sellerId: string): Promise<BookSale[]> {
    this.logger.debug(`Finding book sales by seller: ${sellerId}`);
    return db
      .select()
      .from(bookSales)
      .where(eq(bookSales.sellerId, sellerId))
      .orderBy(desc(bookSales.purchasedAt));
  }

  async create(data: CreateBookSaleData): Promise<BookSale> {
    this.logger.info(`Creating book sale for book: ${data.bookId}`);
    const [sale] = await db.insert(bookSales).values(data).returning();
    return sale;
  }
}
