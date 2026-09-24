export type Story = {
  id: string;
  authorId: string;
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
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateStoryInput = {
  authorId: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  coverImage?: string | null;
  status?: string;
  categoryId?: string | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
};

export type UpdateStoryInput = Partial<{
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  coverImage: string | null;
  status: string;
  categoryId: string | null;
  publishedAt: Date | null;
}>;

export type StoryAuthor = {
  id: string;
  name: string;
};

export type StoryResponse = {
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
  author: StoryAuthor;
  createdAt: string;
  updatedAt: string;
};

export type StoriesListResponse = {
  stories: StoryResponse[];
  total: number;
  page: number;
  limit: number;
};

export type StoryStatus = 'draft' | 'published' | 'archived';
