export type ReadingProgress = {
  id: string;
  userId: string;
  bookId: string;
  currentPage: number;
  totalPages: number | null;
  progressPercentage: number;
  startedAt: string;
  lastReadAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReadingProgressResponse = {
  id: string;
  bookId: string;
  currentPage: number;
  totalPages: number | null;
  progressPercentage: number;
  lastReadAt: string;
  completedAt: string | null;
};

export type ReadingProgressListResponse = {
  progress: ReadingProgressResponse[];
  total: number;
  page: number;
  limit: number;
};

export type CreateReadingProgressInput = {
  bookId: string;
  currentPage?: number;
  totalPages?: number | null;
  progressPercentage?: number;
};

export type UpdateReadingProgressInput = {
  currentPage?: number;
  totalPages?: number | null;
  progressPercentage?: number;
};
