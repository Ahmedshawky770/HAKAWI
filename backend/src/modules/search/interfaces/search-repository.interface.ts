export interface ISearchRepository {
  indexStory(story: SearchableStory): Promise<void>;
  indexUser(user: SearchableUser): Promise<void>;
  removeFromIndex(entityType: string, entityId: string): Promise<void>;
  searchStories(query: string, filters: SearchFilters, page: number, limit: number): Promise<SearchResult<SearchableStory>>;
  searchUsers(query: string, page: number, limit: number): Promise<SearchResult<SearchableUser>>;
  searchCategories(query: string, page: number, limit: number): Promise<SearchResult<SearchableStoryCategory>>;
  getSuggestions(query: string, limit: number): Promise<string[]>;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchFilters {
  category?: string;
  author?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}

export interface SearchableStory {
  id: string;
  sanityStoryId: string | null;
  authorId: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string | null;
  status: string;
  wordCount: number;
  readingTime: number;
  views: number;
  reactions: Record<string, unknown> | null;
  comments: Record<string, unknown> | null;
  category: string;
  tags: string[];
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchableUser {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  accountType: string;
}

export interface SearchableStoryCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SEARCH_REPOSITORY = 'SEARCH_REPOSITORY';

export type Story = SearchableStory;
export type User = SearchableUser;
export type StoryCategory = SearchableStoryCategory;
