import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { rentalExtensions } from '../../../db/schema/rental-extensions.schema.js';
import { db } from '../../../db/index.js';
import type {
  IRentalExtensionsRepository,
  RentalExtension,
  CreateRentalExtensionData,
} from '../interfaces/rental-extensions-repository.interface.js';

@Injectable()
export class RentalExtensionsRepository implements IRentalExtensionsRepository {
  private readonly logger = new Logger(RentalExtensionsRepository.name);

  async findById(id: string): Promise<RentalExtension | null> {
    this.logger.debug(`Finding rental extension by id: ${id}`);
    const [extension] = await db
      .select()
      .from(rentalExtensions)
      .where(eq(rentalExtensions.id, id))
      .limit(1);
    return extension ?? null;
  }

  async findByRentalId(rentalId: string): Promise<RentalExtension[]> {
    this.logger.debug(`Finding extensions by rental: ${rentalId}`);
    return db
      .select()
      .from(rentalExtensions)
      .where(eq(rentalExtensions.rentalId, rentalId))
      .orderBy(desc(rentalExtensions.createdAt));
  }

  async findByUserId(userId: string): Promise<RentalExtension[]> {
    this.logger.debug(`Finding extensions by user: ${userId}`);
    return db
      .select()
      .from(rentalExtensions)
      .where(eq(rentalExtensions.userId, userId))
      .orderBy(desc(rentalExtensions.createdAt));
  }

  async create(data: CreateRentalExtensionData): Promise<RentalExtension> {
    this.logger.info(`Creating rental extension for rental: ${data.rentalId}`);
    const [extension] = await db
      .insert(rentalExtensions)
      .values(data)
      .returning();
    return extension;
  }
}
