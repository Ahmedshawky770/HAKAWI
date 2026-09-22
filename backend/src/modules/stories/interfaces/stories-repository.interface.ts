import { symbol } from '../utils/symbol.util.js';
import type { Story } from '../../../db/schema/stories.schema.js';
import type { NewStory } from '../../../db/schema/stories.schema.js';

export const STORIES_REPOSITORY = symbol('STORIES_REPOSITORY');

export interface StoryFilters {
  category?: string;
  authorId?: string;
  status?: string;
  sortBy?: 'createdAt' | 'publishedAt' | 'views';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export type CreateStoryData = NewStory;
export type UpdateStoryData = Partial<CreateStoryData>;

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
  create(data: CreateStoryData): Promise<Story>;
}
