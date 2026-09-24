export const STORIES_REPOSITORY = Symbol('STORIES_REPOSITORY');

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
  categoryId?: string | null;
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

export interface IStoriesRepository {
  findById(id: string): Promise<Story | null>;
  findBySlug(slug: string): Promise<Story | null>;
  findAll(params: {
    page?: number;
    limit?: number;
    authorId?: string;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<{ stories: Story[]; total: number }>;
  create(data: CreateStoryInput): Promise<Story>;
  update(id: string, data: UpdateStoryInput): Promise<Story>;
  softDelete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
}
