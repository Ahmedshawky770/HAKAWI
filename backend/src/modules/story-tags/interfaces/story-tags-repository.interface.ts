export interface IStoryTagsRepository {
  findById(id: string): Promise<StoryTag | null>;
  findByName(name: string): Promise<StoryTag | null>;
  findBySlug(slug: string): Promise<StoryTag | null>;
  findAll(): Promise<StoryTag[]>;
  create(data: CreateStoryTagData): Promise<StoryTag>;
  delete(id: string): Promise<void>;
}

export interface StoryTag {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface CreateStoryTagData {
  name: string;
  slug: string;
}

export const STORY_TAGS_REPOSITORY = 'STORY_TAGS_REPOSITORY';
