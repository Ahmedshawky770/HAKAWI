export interface IContestsRepository {
  findById(id: string): Promise<Contest | null>;
  findByPublisherId(publisherId: string): Promise<Contest[]>;
  findPublished(filters: ContestFilters): Promise<Contest[]>;
  create(data: CreateContestData): Promise<Contest>;
  update(id: string, data: Partial<UpdateContestData>): Promise<Contest>;
  delete(id: string): Promise<void>;
  count(filters: ContestFilters): Promise<number>;
}

export type ContestStatus = 'draft' | 'published' | 'active' | 'voting' | 'completed' | 'cancelled';
export type PrizeType = 'cash' | 'badge' | 'recognition' | 'publication';

export interface Contest {
  id: string;
  publisherId: string;
  title: string;
  description: string;
  theme: string | null;
  category: string;
  participantType: string;
  status: ContestStatus;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
  prizeType: PrizeType;
  prizeValue: number | null;
  prizeDescription: string | null;
  rules: string | null;
  minWordCount: number | null;
  maxWordCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContestData {
  publisherId: string;
  title: string;
  description: string;
  theme?: string | null;
  category: string;
  participantType: string;
  status: ContestStatus;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
  prizeType: PrizeType;
  prizeValue?: number | null;
  prizeDescription?: string | null;
  rules?: string | null;
  minWordCount?: number;
  maxWordCount?: number | null;
}

export interface UpdateContestData extends Partial<CreateContestData> {}

export interface ContestFilters {
  category?: string;
  status?: string;
  participantType?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

export const CONTESTS_REPOSITORY = 'CONTESTS_REPOSITORY';
