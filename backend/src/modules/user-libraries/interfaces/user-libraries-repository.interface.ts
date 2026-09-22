import { symbol } from '../utils/symbol.util.js';
import type { UserLibrary } from '../../../db/schema/user-libraries.schema.js';
import type { NewUserLibrary } from '../../../db/schema/user-libraries.schema.js';

export const USER_LIBRARIES_REPOSITORY = symbol('USER_LIBRARIES_REPOSITORY');

export type CreateUserLibraryData = NewUserLibrary;

export interface IUserLibrariesRepository {
  findById(id: string): Promise<UserLibrary | null>;
  findByUserId(userId: string): Promise<UserLibrary[]>;
  findByBookId(bookId: string): Promise<UserLibrary[]>;
  findByUserAndBook(userId: string, bookId: string): Promise<UserLibrary | null>;
  create(data: CreateUserLibraryData): Promise<UserLibrary>;
  delete(id: string): Promise<void>;
}
