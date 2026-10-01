import { isOneOf } from './common.js';
import type { NamedPaginated } from './common.js';

export const BOOK_STATUSES = ['draft', 'published', 'archived'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const isBookStatus = (value: string): value is BookStatus => isOneOf(BOOK_STATUSES, value);

export type Book = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverImage: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  language: string | null;
  pageCount: number | null;
  fileUrl: string | null;
  fileType: string | null;
  price: number | null;
  isFree: boolean;
  status: string;
  categoryId: string | null;
  views: number;
  likes: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type BooksListResponse = NamedPaginated<'books', Book>;

export type BookRecord = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverImage: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
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
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReadingProgress = {
  id: string;
  bookId: string;
  currentPage: number;
  totalPages: number | null;
  progressPercentage: number;
  lastReadAt: string;
  completedAt: string | null;
};

export type ReadingProgressListResponse = NamedPaginated<'progress', ReadingProgress>;
