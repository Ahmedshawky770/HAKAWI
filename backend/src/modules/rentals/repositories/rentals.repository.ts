import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, count, sql, lt } from 'drizzle-orm';

import { IRentalsRepository, Rental, CreateRentalInput, RentalExtension } from '../interfaces/rentals-repository.interface.ts';
import { RENTALS_REPOSITORY } from '../interfaces/rentals-repository.interface.ts';
import { rentals, rentalExtensions } from '../../../db/schema/rentals.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class RentalsRepository implements IRentalsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Rental | null> {
    this.logger.debug(`Finding rental by id: ${id}`);
    try {
      const [rental] = await db.select().from(rentals).where(eq(rentals.id, id)).limit(1);
      return rental ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUserAndBook(userId: string, bookId: string): Promise<Rental | null> {
    this.logger.debug(`Finding rental by user: ${userId} and book: ${bookId}`);
    const [rental] = await db
      .select()
      .from(rentals)
      .where(and(eq(rentals.userId, userId), eq(rentals.bookId, bookId), eq(rentals.deletedAt, null as unknown as Date)))
      .limit(1);
    return rental ?? null;
  }

  async findActiveByUser(userId: string): Promise<Rental[]> {
    this.logger.debug(`Finding active rentals for user: ${userId}`);
    return db.select().from(rentals).where(and(eq(rentals.userId, userId), eq(rentals.status, 'active'), eq(rentals.deletedAt, null as unknown as Date)));
  }

  async findAll(params: {
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rentals: Rental[]; total: number }> {
    this.logger.debug('Finding all rentals');
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(rentals.deletedAt, null as unknown as Date)];

    if (params.userId) {
      conditions.push(eq(rentals.userId, params.userId));
    }
    if (params.status) {
      conditions.push(eq(rentals.status, params.status));
    }

    const whereClause = and(...conditions);

    const [rentalsResult, [{ total }]] = await Promise.all([
      db.select().from(rentals).where(whereClause).orderBy(desc(rentals.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(rentals).where(whereClause),
    ]);

    return { rentals: rentalsResult, total: Number(total) };
  }

  async create(data: CreateRentalInput): Promise<Rental> {
    this.logger.info(`Creating rental for user: ${data.userId}, book: ${data.bookId}`);
    const durationDays = data.durationDays ?? 14;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const [rental] = await db.insert(rentals).values({
      userId: data.userId,
      bookId: data.bookId,
      status: 'active',
      startDate,
      endDate,
      extendedCount: 0,
      maxExtensions: 2,
    }).returning();
    return rental;
  }

  async update(id: string, data: Partial<Rental>): Promise<Rental> {
    this.logger.debug(`Updating rental: ${id}`);
    const [rental] = await db.update(rentals).set({ ...data, updatedAt: new Date() }).where(eq(rentals.id, id)).returning();
    return rental;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting rental: ${id}`);
    await db.update(rentals).set({ deletedAt: new Date() }).where(eq(rentals.id, id));
  }

  async createExtension(data: {
    rentalId: string;
    previousEndDate: Date;
    newEndDate: Date;
    extensionDays: number;
  }): Promise<RentalExtension> {
    this.logger.info(`Creating extension for rental: ${data.rentalId}`);
    const [extension] = await db.insert(rentalExtensions).values(data).returning();
    return extension;
  }

  async findExtensionsByRental(rentalId: string): Promise<RentalExtension[]> {
    this.logger.debug(`Finding extensions for rental: ${rentalId}`);
    return db.select().from(rentalExtensions).where(eq(rentalExtensions.rentalId, rentalId));
  }

  async findOverdue(): Promise<Rental[]> {
    this.logger.debug('Finding overdue rentals');
    return db.select().from(rentals).where(and(eq(rentals.status, 'active'), lt(rentals.endDate, new Date()), eq(rentals.deletedAt, null as unknown as Date)));
  }
}
