export const REACTIONS_REPOSITORY = Symbol('REACTIONS_REPOSITORY');

export type Reaction = {
  id: string;
  userId: string;
  storyId: string;
  type: string;
  createdAt: Date;
};

export type ReactionType = 'like' | 'love' | 'wow' | 'sad' | 'angry' | 'haunted';

export interface IReactionsRepository {
  findById(id: string): Promise<Reaction | null>;
  findByUserAndStory(userId: string, storyId: string): Promise<Reaction | null>;
  findReactionsByStory(storyId: string, page: number, limit: number): Promise<{ reactions: Reaction[]; total: number }>;
  create(data: { userId: string; storyId: string; type: string }): Promise<Reaction>;
  update(id: string, data: { type: string }): Promise<Reaction>;
  delete(id: string): Promise<void>;
  deleteByUserAndStory(userId: string, storyId: string): Promise<void>;
  countReactions(storyId: string): Promise<number>;
  countReactionsByType(storyId: string, type: string): Promise<number>;
  /**
   * Every type present on the story with its count, in ONE grouped query.
   *
   * Added because the service used to ask `countReactionsByType` once per supported type — six
   * sequential round trips to render one badge row, on a `@Public()` route. `countReactionsByType` is
   * kept because deleting an exported method is a deliberate call (Principle #8), not a side effect of
   * adding a faster one.
   */
  countByType(storyId: string): Promise<Record<string, number>>;
}
