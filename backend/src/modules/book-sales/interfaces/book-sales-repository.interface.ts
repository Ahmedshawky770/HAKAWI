import { symbol } from '../utils/symbol.util.js';
import type { BookSale } from '../../../db/schema/book-sales.schema.js';
import type { NewBookSale } from '../../../db/schema/book-sales.schema.js';

export const BOOK_SALES_REPOSITORY = symbol('BOOK_SALES_REPOSITORY');

export type CreateBookSaleData = NewBookSale;

export interface IBookSalesRepository {
  findById(id: string): Promise<BookSale | null>;
  findByTransactionId(transactionId: string): Promise<BookSale | null>;
  findByBookId(bookId: string): Promise<BookSale[]>;
  findByBuyerId(buyerId: string): Promise<BookSale[]>;
  findBySellerId(sellerId: string): Promise<BookSale[]>;
  create(data: CreateBookSaleData): Promise<BookSale>;
}
