export const BOOKS_REPOSITORY = Symbol('BOOKS_REPOSITORY');

export type Book = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverImage: string | null;
  isbn: string | null;
  publisher: string | null;
  /**
   * The owning account, or `null` for a book created before migration 0021.
   *
   * `null` is UNOWNED, not unowned-but-editable-by-nobody-silently: `BooksService` refuses every write
   * path for a null owner to a non-administrator and requires an administrator to claim it. It cannot
   * be derived from `author`, which is a display name — a match would be a guess, and a wrong guess
   * transfers a book to the wrong account.
   */
  ownerId: string | null;
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
  /** Set from the authenticated caller, never from the request body — see `CreateBookDto`. */
  ownerId: string;
  /**
   * The lifecycle state. The service sets it to `draft` on create and the transition methods
   * (`publish`, `archive`) own every other change — the DTO does not declare `status`, so a client
   * cannot set it, which is the same rule `UpdateStoryDto` follows after its own status bypass.
   */
  status?: string;
  /**
   * The three counters, initialised to 0 on create. They are then maintained by the module's own event
   * handlers, exactly as the stories and comments counters are, rather than being written by whichever
   * request happens to touch the book.
   */
  viewCount?: number;
  likeCount?: number;
  downloadCount?: number;
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
