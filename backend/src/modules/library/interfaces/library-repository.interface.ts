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
  findByUser(
    userId: string,
    params: { status?: string; page?: number; limit?: number },
  ): Promise<{ items: LibraryItem[]; total: number }>;
  findByUserAndBook(userId: string, bookId: string): Promise<LibraryItem | null>;
  /**
   * The library row that represents a given rental's current access, if any.
   *
   * A rental confers access by being recorded here (`status: 'rented'`), and the row is the thing
   * `POST /books/:id/download` consults — so the pair of facts that end a rental (`rental.returned`,
   * `rental.expired`) have to be able to find it again, by the rental rather than by the book.
   */
  findByRentalId(rentalId: string): Promise<LibraryItem | null>;
  create(data: { userId: string; bookId: string; rentalId?: string | null; status?: string }): Promise<LibraryItem>;
  update(id: string, data: Partial<LibraryItem>): Promise<LibraryItem>;
  delete(id: string): Promise<void>;
  countByUser(userId: string): Promise<number>;
}
