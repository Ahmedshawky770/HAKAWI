export type LibraryItem = {
  id: string;
  userId: string;
  bookId: string;
  rentalId: string | null;
  status: string;
  addedAt: Date;
  lastAccessedAt: Date | null;
};

export type LibraryQuery = {
  userId: string;
  status?: string;
  page?: number;
  limit?: number;
};

export type LibraryItemResponse = {
  id: string;
  userId: string;
  bookId: string;
  rentalId: string | null;
  status: string;
  addedAt: string;
  lastAccessedAt: string | null;
};

export type LibraryListResponse = {
  items: LibraryItemResponse[];
  total: number;
  page: number;
  limit: number;
};

export type LibraryItemStatus = 'owned' | 'rented' | 'reading' | 'completed';
