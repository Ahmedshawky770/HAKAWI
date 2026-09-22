import { symbol } from '../../common/utils/symbol.util.js';
import type { StoryCategory } from '../../../db/schema/story-categories.schema.js';
import type { NewStoryCategory } from '../../../db/schema/story-categories.schema.js';

export const STORY_CATEGORIES_REPOSITORY = symbol('STORY_CATEGORIES_REPOSITORY');

export type CreateStoryCategoryData = NewStoryCategory;
export type UpdateStoryCategoryData = Partial<CreateStoryCategoryData>;

export { StoryCategory };

export interface IStoryCategoriesRepository {
  findById(id: string): Promise<StoryCategory | null>;
  findByName(name: string): Promise<StoryCategory | null>;
  findBySlug(slug: string): Promise<StoryCategory | null>;
  findAll(): Promise<StoryCategory[]>;
  create(data: CreateStoryCategoryData): Promise<StoryCategory>;
  update(id: string, data: Partial<UpdateStoryCategoryData>): Promise<StoryCategory>;
  delete(id: string): Promise<void>;
}
