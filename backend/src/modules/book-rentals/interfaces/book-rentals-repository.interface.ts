import { symbol } from '../../common/utils/symbol.util.js';
import type { BookRental } from '../../../db/schema/book-rentals.schema.js';
import type { NewBookRental } from '../../../db/schema/book-rentals.schema.js';

export type RentalDuration = 'daily' | 'weekly' | 'monthly';
export type RentalStatus = 'active' | 'completed' | 'cancelled' | 'expired';

export type CreateBookRentalData = NewBookRental;
export type UpdateBookRentalData = Partial<CreateBookRentalData>;

export { BookRental };

export const BOOK_RENTALS_REPOSITORY = symbol('BOOK_RENTALS_REPOSITORY');

export interface IBookRentalsRepository {
  findById(id: string): Promise<BookRental | null>;
  findByBookId(bookId: string): Promise<BookRental[]>;
  findByRenterId(renterId: string): Promise<BookRental[]>;
  findActiveByBookId(bookId: string): Promise<BookRental | null>;
  create(data: CreateBookRentalData): Promise<BookRental>;
  update(id: string, data: Partial<UpdateBookRentalData>): Promise<BookRental>;
  findExpiredRentals(): Promise<BookRental[]>;
}
