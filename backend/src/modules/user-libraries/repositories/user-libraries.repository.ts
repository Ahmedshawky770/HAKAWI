import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { userLibraries } from '../../../db/schema/user-libraries.schema.js';
import { db } from '../../../db/index.js';
import type {
  IUserLibrariesRepository,
  UserLibrary,
  CreateUserLibraryData,
} from '../interfaces/user-libraries-repository.interface.js';

@Injectable()
export class UserLibrariesRepository implements IUserLibrariesRepository {
  private readonly logger = new Logger(UserLibrariesRepository.name);

  async findById(id: string): Promise<UserLibrary | null> {
    this.logger.debug(`Finding user library by id: ${id}`);
    const [library] = await db
      .select()
      .from(userLibraries)
      .where(eq(userLibraries.id, id))
      .limit(1);
    return library ?? null;
  }

  async findByUserId(userId: string): Promise<UserLibrary[]> {
    this.logger.debug(`Finding library entries by user: ${userId}`);
    return db
      .select()
      .from(userLibraries)
      .where(eq(userLibraries.userId, userId))
      .orderBy(desc(userLibraries.createdAt));
  }

  async findByBookId(bookId: string): Promise<UserLibrary[]> {
    this.logger.debug(`Finding library entries by book: ${bookId}`);
    return db
      .select()
      .from(userLibraries)
      .where(eq(userLibraries.bookId, bookId))
      .orderBy(desc(userLibraries.createdAt));
  }

  async findByUserAndBook(
    userId: string,
    bookId: string,
  ): Promise<UserLibrary | null> {
    this.logger.debug(
      `Finding library entry for user: ${userId}, book: ${bookId}`,
    );
    const [library] = await db
      .select()
      .from(userLibraries)
      .where(
        and(eq(userLibraries.userId, userId), eq(userLibraries.bookId, bookId)),
      )
      .limit(1);
    return library ?? null;
  }

  async create(data: CreateUserLibraryData): Promise<UserLibrary> {
    this.logger.info(
      `Creating user library entry for user: ${data.userId}, book: ${data.bookId}`,
    );
    const [library] = await db.insert(userLibraries).values(data).returning();
    return library;
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting user library entry: ${id}`);
    await db.delete(userLibraries).where(eq(userLibraries.id, id));
  }
}
