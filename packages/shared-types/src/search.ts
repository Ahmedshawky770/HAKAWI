import type { AuthorSummary, NamedPage } from './common.js';

export const SEARCH_SORT_FIELDS = ['relevance', 'date', 'views', 'reactions'] as const;
export type SearchSortField = (typeof SEARCH_SORT_FIELDS)[number];

export type SearchResult = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  category: string | null;
  tags: string[];
  author: AuthorSummary;
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

export type AuthorSearchResult = {
  id: string;
  name: string;
  storiesCount: number;
};

export type AuthorSearchResponse = NamedPage<'authors', AuthorSearchResult>;

export type CategorySearchResult = {
  id: string;
  name: string;
  slug: string;
  storiesCount: number;
};
