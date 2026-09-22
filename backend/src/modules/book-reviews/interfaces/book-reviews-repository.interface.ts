export interface IBookReviewsRepository {
  findById(id: string): Promise<BookReview | null>;
  findByBookId(bookId: string): Promise<BookReview[]>;
  findByUserId(userId: string): Promise<BookReview[]>;
  findByBookAndUser(bookId: string, userId: string): Promise<BookReview | null>;
  create(data: CreateBookReviewData): Promise<BookReview>;
  update(id: string, data: Partial<UpdateBookReviewData>): Promise<BookReview>;
  delete(id: string): Promise<void>;
}

export interface BookReview {
  id: string;
  bookId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookReviewData {
  bookId: string;
  userId: string;
  rating: number;
  comment?: string;
}

export interface UpdateBookReviewData extends Partial<Pick<BookReview, 'rating' | 'comment'>> {}

export const BOOK_REVIEWS_REPOSITORY = 'BOOK_REVIEWS_REPOSITORY';
