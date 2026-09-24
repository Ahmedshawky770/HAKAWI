import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { IUsersRepository, User, CreateUserInput, UpdateUserInput } from '../interfaces/users-repository.interface.ts';
import { users } from '../../../db/schema/users.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class UsersRepository implements IUsersRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<User | null> {
    this.logger.debug(`Finding user by id: ${id}`);
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    this.logger.debug(`Finding user by email: ${email}`);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    this.logger.debug(`Finding user by username: ${username}`);
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user ?? null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    this.logger.debug(`Finding user by googleId: ${googleId}`);
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return user ?? null;
  }

  async findByFacebookId(facebookId: string): Promise<User | null> {
    this.logger.debug(`Finding user by facebookId: ${facebookId}`);
    const [user] = await db.select().from(users).where(eq(users.facebookId, facebookId)).limit(1);
    return user ?? null;
  }

  async findByTwitterId(twitterId: string): Promise<User | null> {
    this.logger.debug(`Finding user by twitterId: ${twitterId}`);
    const [user] = await db.select().from(users).where(eq(users.twitterId, twitterId)).limit(1);
    return user ?? null;
  }

  async findByGithubId(githubId: string): Promise<User | null> {
    this.logger.debug(`Finding user by githubId: ${githubId}`);
    const [user] = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return user ?? null;
  }

  async findByAppleId(appleId: string): Promise<User | null> {
    this.logger.debug(`Finding user by appleId: ${appleId}`);
    const [user] = await db.select().from(users).where(eq(users.appleId, appleId)).limit(1);
    return user ?? null;
  }

  async findByTiktokId(tiktokId: string): Promise<User | null> {
    this.logger.debug(`Finding user by tiktokId: ${tiktokId}`);
    const [user] = await db.select().from(users).where(eq(users.tiktokId, tiktokId)).limit(1);
    return user ?? null;
  }

  async create(data: CreateUserInput): Promise<User> {
    this.logger.info(`Creating user with email: ${data.email}`);
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async update(id: string, data: Partial<UpdateUserInput>): Promise<User> {
    this.logger.debug(`Updating user: ${id}`);
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting user: ${id}`);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  }
}