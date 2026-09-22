import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { bookReviews } from '../../../db/schema/book-reviews.schema.js';
import { db } from '../../../db/index.js';
import type {
  IBookReviewsRepository,
  BookReview,
  CreateBookReviewData,
  UpdateBookReviewData,
} from '../interfaces/book-reviews-repository.interface.js';

@Injectable()
export class BookReviewsRepository implements IBookReviewsRepository {
  private readonly logger = new Logger(BookReviewsRepository.name);

  private castReview = (
    review: Omit<BookReview, 'comment'> & { comment: string | null },
  ): BookReview => ({
    ...review,
    comment: review.comment ?? '',
  });

  async findById(id: string): Promise<BookReview | null> {
    this.logger.debug(`Finding book review by id: ${id}`);
    const [review] = await db
      .select()
      .from(bookReviews)
      .where(eq(bookReviews.id, id))
      .limit(1);
    return review ? this.castReview(review) : null;
  }

  async findByBookId(bookId: string): Promise<BookReview[]> {
    this.logger.debug(`Finding reviews by book: ${bookId}`);
    const reviews = await db
      .select()
      .from(bookReviews)
      .where(eq(bookReviews.bookId, bookId))
      .orderBy(desc(bookReviews.createdAt));
    return reviews.map((r) => this.castReview(r));
  }

  async findByUserId(userId: string): Promise<BookReview[]> {
    this.logger.debug(`Finding reviews by user: ${userId}`);
    const reviews = await db
      .select()
      .from(bookReviews)
      .where(eq(bookReviews.userId, userId))
      .orderBy(desc(bookReviews.createdAt));
    return reviews.map((r) => this.castReview(r));
  }

  async findByBookAndUser(
    bookId: string,
    userId: string,
  ): Promise<BookReview | null> {
    this.logger.debug(`Finding review by book: ${bookId}, user: ${userId}`);
    const [review] = await db
      .select()
      .from(bookReviews)
      .where(
        and(eq(bookReviews.bookId, bookId), eq(bookReviews.userId, userId)),
      )
      .limit(1);
    return review ? this.castReview(review) : null;
  }

  async create(data: CreateBookReviewData): Promise<BookReview> {
    this.logger.log(`Creating book review for book: ${data.bookId}`);
    const [review] = await db.insert(bookReviews).values(data).returning();
    return this.castReview(review);
  }

  async update(
    id: string,
    data: Partial<UpdateBookReviewData>,
  ): Promise<BookReview> {
    this.logger.debug(`Updating book review: ${id}`);
    const [review] = await db
      .update(bookReviews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bookReviews.id, id))
      .returning();
    return this.castReview(review);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting book review: ${id}`);
    await db.delete(bookReviews).where(eq(bookReviews.id, id));
  }
}
