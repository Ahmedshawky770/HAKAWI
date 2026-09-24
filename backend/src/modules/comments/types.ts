export type Comment = {
  id: string;
  storyId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCommentInput = {
  storyId: string;
  authorId: string;
  content: string;
  parentId?: string;
};

export type UpdateCommentInput = {
  content: string;
};

export type CommentResponse = {
  id: string;
  storyId: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  replies?: CommentResponse[];
  createdAt: string;
  updatedAt: string;
};

export type CommentReaction = {
  id: string;
  userId: string;
  commentId: string;
  type: string;
  createdAt: Date;
};

export type ReactionCounts = {
  [key: string]: number;
};

export const VALID_REACTION_TYPES = ['like', 'love', 'wow', 'sad', 'angry', 'haunted'] as const;
