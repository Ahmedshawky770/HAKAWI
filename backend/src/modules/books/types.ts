import type {
  Book as SharedBook,
  BookRecord as SharedBookRecord,
  BookStatus as SharedBookStatus,
  BooksListResponse as SharedBooksListResponse,
  Exact,
} from '@hakawi/shared-types';

import { reviveNullableDate, reviveRequiredDate } from '../shared/cache/date-revival.ts';

export type Book = {
  id: string;
  title: string;
  /** The author's DISPLAY name. Not an identity — see `ownerId`. */
  author: string;
  /**
   * The owning account, or `null` for a book created before migration 0021.
   *
   * Every write guard reads this and NOT `author`. It is `null` rather than absent so "unowned" is a
   * state the code must handle rather than a value it can trip over — see `BooksService.assertOwnership`.
   *
   * IT IS DELIBERATELY ABSENT FROM `BookResponse` AND `BookRecord`. Those are the public and admin
   * shapes, and `ownerId` is an ACCOUNT id: publishing it would tell any reader which account owns
   * which book on a platform with many authors. It is an internal authorization fact, not content.
   */
  ownerId: string | null;
  description: string | null;
  coverImage: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: Date | null;
  language: string | null;
  pageCount: number | null;
  fileUrl: string | null;
  fileType: string | null;
  price: number | null;
  isFree: boolean;
  status: string;
  categoryId: string | null;
  viewCount: number;
  likeCount: number;
  downloadCount: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BackendBookStatus = 'draft' | 'published' | 'archived';

export const BOOK_STATUSES_MATCH_SHARED_CONTRACT: Exact<BackendBookStatus, SharedBookStatus> = true;

export const BACKEND_BOOK_STATUSES = ['draft', 'published', 'archived'] as const satisfies readonly BackendBookStatus[];

export type BookStatus = SharedBookStatus;

export type BookResponse = SharedBook;

export type BookRecord = SharedBookRecord;

export type BooksListResponse = SharedBooksListResponse;

/**
 * Restores the `Date` fields of a book that came back from the cache.
 *
 * `toBookResponse`/`toBookRecord` call `.toISOString()` on `createdAt` and `updatedAt`; a value
 * that only survived `JSON.stringify` → `JSON.parse` hands them ISO strings instead, and the
 * request dies with `TypeError: ...toISOString is not a function`. This makes the cached path
 * shape-identical to the uncached one. The primitives live in `shared/cache/date-revival.ts`;
 * which fields are dates is book knowledge, so the field list stays here (Principle #10).
 */
export function reviveBookDates(book: Book): Book {
  return {
    ...book,
    publishDate: reviveNullableDate(book.publishDate, 'publishDate'),
    deletedAt: reviveNullableDate(book.deletedAt, 'deletedAt'),
    createdAt: reviveRequiredDate(book.createdAt, 'createdAt'),
    updatedAt: reviveRequiredDate(book.updatedAt, 'updatedAt'),
  };
}

export function toBookResponse(book: Book): BookResponse {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    coverImage: book.coverImage,
    isbn: book.isbn,
    publisher: book.publisher,
    publishDate: book.publishDate?.toISOString() ?? null,
    language: book.language,
    pageCount: book.pageCount,
    fileUrl: book.fileUrl,
    fileType: book.fileType,
    price: book.price,
    isFree: book.isFree,
    status: book.status,
    categoryId: book.categoryId,
    views: book.viewCount,
    likes: book.likeCount,
    downloads: book.downloadCount,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}

export function toBookRecord(book: Book): BookRecord {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    coverImage: book.coverImage,
    isbn: book.isbn,
    publisher: book.publisher,
    publishDate: book.publishDate?.toISOString() ?? null,
    language: book.language,
    pageCount: book.pageCount,
    fileUrl: book.fileUrl,
    fileType: book.fileType,
    price: book.price,
    isFree: book.isFree,
    status: book.status,
    categoryId: book.categoryId,
    viewCount: book.viewCount,
    likeCount: book.likeCount,
    downloadCount: book.downloadCount,
    deletedAt: book.deletedAt?.toISOString() ?? null,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}

/**
 * Re-exported, not re-declared — see the note above. `CreateBookInput` and `UpdateBookInput` are
 * defined once, in `interfaces/books-repository.interface.ts`, because that is the contract the
 * repository enforces. The service builds that shape; the repository consumes it; a field added to one
 * and forgotten in the other is no longer expressible.
 */
export type { CreateBookInput, UpdateBookInput } from './interfaces/books-repository.interface.ts';
