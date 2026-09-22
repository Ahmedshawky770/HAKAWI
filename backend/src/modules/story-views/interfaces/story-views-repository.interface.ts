export interface IStoryViewsRepository {
  create(data: CreateStoryViewData): Promise<StoryView>;
  findByStoryId(storyId: string): Promise<StoryView[]>;
  findByViewerId(viewerId: string): Promise<StoryView[]>;
  countByStoryId(storyId: string): Promise<number>;
}

export interface StoryView {
  id: string;
  storyId: string;
  viewerId: string;
  viewDuration: number;
  createdAt: Date;
}

export interface CreateStoryViewData {
  storyId: string;
  viewerId: string;
  viewDuration: number;
}

export const STORY_VIEWS_REPOSITORY = 'STORY_VIEWS_REPOSITORY';
