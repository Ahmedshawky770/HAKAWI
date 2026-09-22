export interface IStoryCategoriesRepository {
  findById(id: string): Promise<StoryCategory | null>;
  findByName(name: string): Promise<StoryCategory | null>;
  findBySlug(slug: string): Promise<StoryCategory | null>;
  findAll(): Promise<StoryCategory[]>;
  create(data: CreateStoryCategoryData): Promise<StoryCategory>;
  update(id: string, data: Partial<UpdateStoryCategoryData>): Promise<StoryCategory>;
  delete(id: string): Promise<void>;
}

export interface StoryCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStoryCategoryData {
  name: string;
  slug: string;
  description: string;
}

export interface UpdateStoryCategoryData extends Partial<CreateStoryCategoryData> {}

export const STORY_CATEGORIES_REPOSITORY = 'STORY_CATEGORIES_REPOSITORY';
