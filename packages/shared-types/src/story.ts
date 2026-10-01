import { isOneOf } from './common.js';
import type { AuthorSummary, NamedPaginated } from './common.js';

export const STORY_STATUSES = ['draft', 'published', 'archived'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const isStoryStatus = (value: string): value is StoryStatus => isOneOf(STORY_STATUSES, value);

export type Story = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  coverImage: string | null;
  status: string;
  category: string | null;
  tags: string[];
  views: number;
  reactions: number;
  author: AuthorSummary;
  createdAt: string;
  updatedAt: string;
};

export type StoriesListResponse = NamedPaginated<'stories', Story>;

export type StoryRecord = {
  id: string;
  authorId: string;
  authorName: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  coverImage: string | null;
  status: string;
  categoryId: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  readingTime: number | null;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoryWriteResult = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export type StoryMutationInput = {
  title: string;
  content: string;
  category: string;
  tags?: string[];
};

export type StoryPatchInput = {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
};
