export const BOOKS_REPOSITORY = Symbol('BOOKS_REPOSITORY');

export type Book = {
  id: string;
  title: string;
  author: string;
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

export type CreateBookInput = {
  title: string;
  author: string;
  description?: string | null;
  coverImage?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  publishDate?: Date | null;
  language?: string | null;
  pageCount?: number | null;
  fileUrl?: string | null;
  fileType?: string | null;
  price?: number | null;
  isFree?: boolean;
  categoryId?: string | null;
};

export type UpdateBookInput = Partial<{
  title: string;
  author: string;
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
}>;

export interface IBooksRepository {
  findById(id: string): Promise<Book | null>;
  findByIsbn(isbn: string): Promise<Book | null>;
  findAll(params: {
    page?: number;
    limit?: number;
    categoryId?: string;
    status?: string;
    search?: string;
    author?: string;
  }): Promise<{ books: Book[]; total: number }>;
  create(data: CreateBookInput): Promise<Book>;
  update(id: string, data: UpdateBookInput): Promise<Book>;
  softDelete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
  incrementDownloadCount(id: string): Promise<void>;
  findByCategory(categoryId: string): Promise<Book[]>;
}
