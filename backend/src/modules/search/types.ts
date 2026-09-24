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
  highlightedTitle?: string;
  highlightedExcerpt?: string;
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  query: string;
  took: number;
};

export type SearchFilters = {
  query?: string;
  category?: string;
  tag?: string;
  authorId?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'date' | 'views' | 'reactions';
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
