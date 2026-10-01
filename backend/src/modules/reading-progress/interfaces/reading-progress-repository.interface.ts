export const READING_PROGRESS_REPOSITORY = Symbol('READING_PROGRESS_REPOSITORY');

export type ReadingProgress = {
  id: string;
  userId: string;
  bookId: string;
  currentPage: number;
  totalPages: number | null;
  progressPercentage: number;
  startedAt: Date;
  lastReadAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateReadingProgressInput = {
  userId: string;
  bookId: string;
  currentPage?: number;
  totalPages?: number | null;
  progressPercentage?: number;
};

export type UpdateReadingProgressInput = Partial<{
  currentPage: number;
  totalPages: number | null;
  progressPercentage: number;
  completedAt: Date | null;
}>;

export interface IReadingProgressRepository {
  findById(id: string): Promise<ReadingProgress | null>;
  findByUserAndBook(userId: string, bookId: string): Promise<ReadingProgress | null>;
  findByUser(
    userId: string,
    params: { bookId?: string; page?: number; limit?: number },
  ): Promise<{ progress: ReadingProgress[]; total: number }>;
  create(data: CreateReadingProgressInput): Promise<ReadingProgress>;
  update(id: string, data: UpdateReadingProgressInput): Promise<ReadingProgress>;
  delete(id: string): Promise<void>;
}
