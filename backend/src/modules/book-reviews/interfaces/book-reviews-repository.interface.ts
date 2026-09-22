import { symbol } from '../../common/utils/symbol.util.js';
import type { BookReview } from '../../../db/schema/book-reviews.schema.js';
import type { NewBookReview } from '../../../db/schema/book-reviews.schema.js';

export const BOOK_REVIEWS_REPOSITORY = symbol('BOOK_REVIEWS_REPOSITORY');

export type CreateBookReviewData = NewBookReview;
export type UpdateBookReviewData = Partial<CreateBookReviewData>;

export { BookReview };

export interface IBookReviewsRepository {
  findById(id: string): Promise<BookReview | null>;
  findByBookId(bookId: string): Promise<BookReview[]>;
  findByUserId(userId: string): Promise<BookReview[]>;
  findByBookAndUser(bookId: string, userId: string): Promise<BookReview | null>;
  create(data: CreateBookReviewData): Promise<BookReview>;
  update(id: string, data: Partial<UpdateBookReviewData>): Promise<BookReview>;
  delete(id: string): Promise<void>;
}
