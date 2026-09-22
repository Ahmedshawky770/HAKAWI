import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql, gt, lt } from 'drizzle-orm';
import { bookRentals } from '../../../db/schema/book-rentals.schema.js';
import { db } from '../../../db/index.js';
import type {
  IBookRentalsRepository,
  BookRental,
  CreateBookRentalData,
  UpdateBookRentalData,
  RentalDuration,
  RentalStatus,
} from '../interfaces/book-rentals-repository.interface.js';

@Injectable()
export class BookRentalsRepository implements IBookRentalsRepository {
  private readonly logger = new Logger(BookRentalsRepository.name);

  private castRental = (rental: unknown): BookRental => {
    const r = rental as Record<string, unknown>;
    return {
      id: r.id as string,
      bookId: r.bookId as string,
      renterId: r.renterId as string,
      rentalDuration: r.rentalDuration as RentalDuration,
      rentalPrice: r.rentalPrice as number,
      platformCommission: r.platformCommission as number,
      ownerEarnings: r.ownerEarnings as number,
      status: r.status as RentalStatus,
      startDate: (r.startDate as Date | null) ?? new Date(),
      endDate: (r.endDate as Date | null) ?? new Date(),
      extensionCount: r.extensionCount as number,
      createdAt: r.createdAt as Date,
      updatedAt: r.updatedAt as Date,
    };
  };

  async findById(id: string): Promise<BookRental | null> {
    this.logger.debug(`Finding book rental by id: ${id}`);
    const [rental] = await db.select().from(bookRentals).where(eq(bookRentals.id, id)).limit(1);
    return rental ? this.castRental(rental) : null;
  }

  async findByBookId(bookId: string): Promise<BookRental[]> {
    this.logger.debug(`Finding rentals by book: ${bookId}`);
    const rentals = await db.select().from(bookRentals).where(eq(bookRentals.bookId, bookId)).orderBy(desc(bookRentals.createdAt));
    return rentals.map((r) => this.castRental(r));
  }

  async findByRenterId(renterId: string): Promise<BookRental[]> {
    this.logger.debug(`Finding rentals by renter: ${renterId}`);
    const rentals = await db.select().from(bookRentals).where(eq(bookRentals.renterId, renterId)).orderBy(desc(bookRentals.createdAt));
    return rentals.map((r) => this.castRental(r));
  }

  async findActiveByBookId(bookId: string): Promise<BookRental | null> {
    this.logger.debug(`Finding active rental for book: ${bookId}`);
    const [rental] = await db.select().from(bookRentals).where(and(eq(bookRentals.bookId, bookId), eq(bookRentals.status, 'active'), gt(bookRentals.endDate, new Date()))).limit(1);
    return rental ? this.castRental(rental) : null;
  }

  async create(data: CreateBookRentalData): Promise<BookRental> {
    this.logger.log(`Creating book rental for book: ${data.bookId}`);
    const [rental] = await db.insert(bookRentals).values(data).returning();
    return this.castRental(rental);
  }

  async update(id: string, data: Partial<UpdateBookRentalData>): Promise<BookRental> {
    this.logger.debug(`Updating book rental: ${id}`);
    const [rental] = await db.update(bookRentals).set({ ...data, updatedAt: new Date() }).where(eq(bookRentals.id, id)).returning();
    return this.castRental(rental);
  }

  async findExpiredRentals(): Promise<BookRental[]> {
    this.logger.debug('Finding expired rentals');
    const rentals = await db.select().from(bookRentals).where(and(eq(bookRentals.status, 'active'), lt(bookRentals.endDate, new Date())));
    return rentals.map((r) => this.castRental(r));
  }
}
