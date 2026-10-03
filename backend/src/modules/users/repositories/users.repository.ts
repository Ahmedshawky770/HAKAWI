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

  /**
   * Writes the patch and returns the stored row.
   *
   * NOTE ON THE MISSING COLUMN PROJECTION: a narrower `.returning({...})` would be the tighter fix,
   * but `IUsersRepository.update` is declared as `Promise<User>` in
   * `common/users/users-repository.interface.ts`, which is a shared contract this module does not
   * own — a projection here would not type-check against it, and the interface's `User` type
   * (deliberately) includes `passwordHash`. Every caller outside this module ignores the return
   * value, so the right fix is to narrow the interface to a credential-free profile row and add a
   * dedicated `updateProfile` for the two flows that need credentials; that is a change to the
   * shared interface and is reported rather than smuggled in here.
   *
   * Until then the boundary holds the line: `UsersService` maps every value returned here through
   * `toClientUser` (an allow-list, `users/types.ts`), so no route that reaches this repository can
   * serialize `passwordHash` or `emailVerificationToken` to a client.
   */
  async update(id: string, data: Partial<UpdateUserInput>): Promise<User> {
    this.logger.debug(`Updating user: ${id}`);
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting user: ${id}`);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  }
}
