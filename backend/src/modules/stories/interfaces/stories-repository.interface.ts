export interface IStoriesRepository {
  findById(id: string): Promise<Story | null>;
  findByAuthorId(authorId: string): Promise<Story[]>;
  findByCategory(category: string): Promise<Story[]>;
  search(query: string): Promise<Story[]>;
  findPublished(filters: StoryFilters): Promise<Story[]>;
  update(id: string, data: Partial<UpdateStoryData>): Promise<Story>;
  delete(id: string): Promise<void>;
  incrementViews(id: string): Promise<void>;
  findMany(filters: StoryFilters): Promise<Story[]>;
  count(filters: StoryFilters): Promise<number>;
}

export interface Story {
  id: string;
  sanityStoryId: string | null;
  authorId: string;
  title: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  status: string;
  wordCount: number;
  readingTime: number;
  views: number;
  reactions: number;
  comments: number;
  category: string | null;
  tags: string[];
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStoryData {
  sanityStoryId?: string | null;
  authorId: string;
  title: string;
  slug: string;
  description?: string | null;
  content: string;
  coverImage?: string | null;
  status?: string;
  wordCount?: number;
  readingTime?: number;
  views?: number;
  reactions?: number;
  comments?: number;
  category?: string | null;
  tags?: string[];
  publishedAt?: Date | null;
  deletedAt?: Date | null;
}

export interface UpdateStoryData extends Partial<CreateStoryData> {}

export interface StoryFilters {
  category?: string;
  tags?: string[];
  authorId?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const STORIES_REPOSITORY = 'STORIES_REPOSITORY';
