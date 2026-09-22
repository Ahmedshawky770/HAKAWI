import { symbol } from '../../common/utils/symbol.util.js';
import type { StoryTag } from '../../../db/schema/story-tags.schema.js';
import type { NewStoryTag } from '../../../db/schema/story-tags.schema.js';

export const STORY_TAGS_REPOSITORY = symbol('STORY_TAGS_REPOSITORY');

export type CreateStoryTagData = NewStoryTag;

export { StoryTag };

export interface IStoryTagsRepository {
  findById(id: string): Promise<StoryTag | null>;
  findByName(name: string): Promise<StoryTag | null>;
  findBySlug(slug: string): Promise<StoryTag | null>;
  findAll(): Promise<StoryTag[]>;
  create(data: CreateStoryTagData): Promise<StoryTag>;
  delete(id: string): Promise<void>;
}
