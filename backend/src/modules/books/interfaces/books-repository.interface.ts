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

export interface Book {
  id: string;
  ownerId: string;
  title: string;
  subtitle: string | null;
  authorName: string;
  coverImage: string | null;
  pdfUrl: string | null;
  pdfPages: number | null;
  price: number;
  isAvailable: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookData {
  ownerId: string;
  title: string;
  subtitle?: string | null;
  authorName: string;
  coverImage?: string | null;
  pdfUrl?: string | null;
  pdfPages?: number | null;
  price: number;
  isAvailable: boolean;
  deletedAt?: Date | null;
}

export interface UpdateBookData extends Partial<CreateBookData> {}

export interface BookFilters {
  category?: string;
  author?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const BOOKS_REPOSITORY = 'BOOKS_REPOSITORY';
