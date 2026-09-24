export const COMMENTS_REPOSITORY = Symbol('COMMENTS_REPOSITORY');
export const COMMENT_REACTIONS_REPOSITORY = Symbol('COMMENT_REACTIONS_REPOSITORY');

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

export interface ICommentsRepository {
  findById(id: string): Promise<Comment | null>;
  findByStory(storyId: string, page: number, limit: number): Promise<{ comments: Comment[]; total: number }>;
  findReplies(parentId: string, page: number, limit: number): Promise<{ replies: Comment[]; total: number }>;
  create(data: CreateCommentInput): Promise<Comment>;
  update(id: string, data: UpdateCommentInput): Promise<Comment>;
  softDelete(id: string): Promise<void>;
  incrementReplyCount(parentId: string): Promise<void>;
  countReplies(parentId: string): Promise<number>;
}

export type CommentReaction = {
  id: string;
  userId: string;
  commentId: string;
  type: string;
  createdAt: Date;
};

export interface ICommentReactionsRepository {
  findById(id: string): Promise<CommentReaction | null>;
  findByUserAndComment(userId: string, commentId: string): Promise<CommentReaction | null>;
  findByComment(commentId: string, page: number, limit: number): Promise<{ reactions: CommentReaction[]; total: number }>;
  create(data: { userId: string; commentId: string; type: string }): Promise<CommentReaction>;
  delete(id: string): Promise<void>;
  deleteByUserAndComment(userId: string, commentId: string): Promise<void>;
  countReactions(commentId: string): Promise<number>;
}
