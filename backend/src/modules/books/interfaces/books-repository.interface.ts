import { symbol } from '../utils/symbol.util.js';
import type { Book } from '../../../db/schema/books.schema.js';
import type { NewBook } from '../../../db/schema/books.schema.js';

export const BOOKS_REPOSITORY = symbol('BOOKS_REPOSITORY');

export interface BookFilters {
  author?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

export type CreateBookData = NewBook;
export type UpdateBookData = Partial<CreateBookData>;

export interface IBooksRepository {
  findById(id: string): Promise<Book | null>;
  findByOwnerId(ownerId: string): Promise<Book[]>;
  findPublished(filters: BookFilters): Promise<Book[]>;
  search(query: string): Promise<Book[]>;
  create(data: CreateBookData): Promise<Book>;
  update(id: string, data: Partial<UpdateBookData>): Promise<Book>;
  delete(id: string): Promise<void>;
  findMany(filters: BookFilters): Promise<Book[]>;
  count(filters: BookFilters): Promise<number>;
}
