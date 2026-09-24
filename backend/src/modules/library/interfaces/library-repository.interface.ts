export const LIBRARY_REPOSITORY = Symbol('LIBRARY_REPOSITORY');

export type LibraryItem = {
  id: string;
  userId: string;
  bookId: string;
  rentalId: string | null;
  status: string;
  addedAt: Date;
  lastAccessedAt: Date | null;
};

export type LibraryQuery = {
  userId: string;
  status?: string;
  page?: number;
  limit?: number;
};

export interface ILibraryRepository {
  findById(id: string): Promise<LibraryItem | null>;
  findByUser(userId: string, params: { status?: string; page?: number; limit?: number }): Promise<{ items: LibraryItem[]; total: number }>;
  findByUserAndBook(userId: string, bookId: string): Promise<LibraryItem | null>;
  create(data: { userId: string; bookId: string; rentalId?: string | null; status?: string }): Promise<LibraryItem>;
  update(id: string, data: Partial<LibraryItem>): Promise<LibraryItem>;
  delete(id: string): Promise<void>;
  countByUser(userId: string): Promise<number>;
}
