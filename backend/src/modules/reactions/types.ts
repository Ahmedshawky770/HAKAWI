export type Reaction = {
  id: string;
  userId: string;
  storyId: string;
  type: string;
  createdAt: Date;
};

export type CreateReactionInput = {
  userId: string;
  storyId: string;
  type: string;
};

export type ReactionResponse = {
  id: string;
  userId: string;
  storyId: string;
  type: string;
  createdAt: string;
};

export type ReactionCounts = {
  [key: string]: number;
};

export const VALID_REACTION_TYPES = ['like', 'love', 'wow', 'sad', 'angry', 'haunted'] as const;
