export const SEARCH_REPOSITORY = Symbol('SEARCH_REPOSITORY');

export type SearchResult = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  category: string | null;
  tags: string[];
  author: {
    id: string;
    name: string;
  };
  views: number;
  reactions: number;
  createdAt: string;
};

export type AuthorSearchResult = {
  id: string;
  name: string;
  storiesCount: number;
};

export type CategorySearchResult = {
  id: string;
  name: string;
  slug: string;
  storiesCount: number;
};

export interface ISearchRepository {
  searchStories(filters: {
    query?: string;
    category?: string;
    tag?: string;
    authorId?: string;
    status?: string;
    page: number;
    limit: number;
    sortBy: string;
  }): Promise<{ results: SearchResult[]; total: number }>;

  searchAuthors(query: string, page: number, limit: number): Promise<{ authors: AuthorSearchResult[]; total: number }>;

  searchCategories(query: string): Promise<CategorySearchResult[]>;
}
