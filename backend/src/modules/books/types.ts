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
  status?: string;
  viewCount?: number;
  likeCount?: number;
  downloadCount?: number;
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

export type BookResponse = {
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

export type BooksListResponse = {
  books: BookResponse[];
  total: number;
  page: number;
  limit: number;
};

export type BookStatus = 'draft' | 'published' | 'archived';
