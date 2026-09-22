export interface IUserLibrariesRepository {
  findById(id: string): Promise<UserLibrary | null>;
  findByUserId(userId: string): Promise<UserLibrary[]>;
  findByBookId(bookId: string): Promise<UserLibrary[]>;
  findByUserAndBook(userId: string, bookId: string): Promise<UserLibrary | null>;
  create(data: CreateUserLibraryData): Promise<UserLibrary>;
  delete(id: string): Promise<void>;
}

export interface UserLibrary {
  id: string;
  userId: string;
  bookId: string;
  accessType: string;
  accessGrantedAt: Date;
  accessExpiresAt: Date | null;
  createdAt: Date;
}

export interface CreateUserLibraryData {
  userId: string;
  bookId: string;
  accessType: string;
  accessExpiresAt?: Date | null;
}

export const USER_LIBRARIES_REPOSITORY = 'USER_LIBRARIES_REPOSITORY';
