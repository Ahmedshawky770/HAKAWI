import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { userRestrictions } from '../../../db/schema/user-restrictions.schema.js';
import { db } from '../../../db/index.js';
import type {
  IUserRestrictionsRepository,
  UserRestriction,
  CreateUserRestrictionData,
  RestrictionType,
} from '../interfaces/user-restrictions-repository.interface.js';

@Injectable()
export class UserRestrictionsRepository implements IUserRestrictionsRepository {
  private readonly logger = new Logger(UserRestrictionsRepository.name);

  private castRestriction = (
    restriction: Omit<UserRestriction, 'restrictionType'> & { restrictionType: string },
  ): UserRestriction => ({
    ...restriction,
    restrictionType: restriction.restrictionType as RestrictionType,
  });

  async findById(id: string): Promise<UserRestriction | null> {
    this.logger.debug(`Finding user restriction by id: ${id}`);
    const [restriction] = await db
      .select()
      .from(userRestrictions)
      .where(eq(userRestrictions.id, id))
      .limit(1);
    return restriction ? this.castRestriction(restriction) : null;
  }

  async findByUserId(userId: string): Promise<UserRestriction[]> {
    this.logger.debug(`Finding user restrictions by user: ${userId}`);
    const restrictions = await db
      .select()
      .from(userRestrictions)
      .where(eq(userRestrictions.userId, userId))
      .orderBy(desc(userRestrictions.createdAt));
    return restrictions.map((r) => this.castRestriction(r));
  }

  async findActiveByUserId(userId: string): Promise<UserRestriction | null> {
    this.logger.debug(`Finding active restriction for user: ${userId}`);
    const [restriction] = await db
      .select()
      .from(userRestrictions)
      .where(
        and(
          eq(userRestrictions.userId, userId),
          sql`${userRestrictions.expiresAt} IS NULL OR ${userRestrictions.expiresAt} > NOW()`,
        ),
      )
      .limit(1);
    return restriction ? this.castRestriction(restriction) : null;
  }

  async create(data: CreateUserRestrictionData): Promise<UserRestriction> {
    this.logger.log(`Creating user restriction for user: ${data.userId}`);
    const [restriction] = await db
      .insert(userRestrictions)
      .values(data)
      .returning();
    return this.castRestriction(restriction);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting user restriction: ${id}`);
    await db.delete(userRestrictions).where(eq(userRestrictions.id, id));
  }

  async deleteExpired(): Promise<number> {
    this.logger.debug('Deleting expired restrictions');
    const result = await db
      .delete(userRestrictions)
      .where(
        sql`${userRestrictions.expiresAt} IS NOT NULL AND ${userRestrictions.expiresAt} < NOW()`,
      );
    return result.rowCount ?? 0;
  }
}
