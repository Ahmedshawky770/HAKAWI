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

export type CommentAuthorSummary = {
  id: string;
  name: string;
};

export interface ICommentsRepository {
  findById(id: string): Promise<Comment | null>;
  findByStory(storyId: string, page: number, limit: number): Promise<{ comments: Comment[]; total: number }>;
  findReplies(parentId: string, page: number, limit: number): Promise<{ replies: Comment[]; total: number }>;
  create(data: CreateCommentInput): Promise<Comment>;
  update(id: string, data: UpdateCommentInput): Promise<Comment>;
  softDelete(id: string): Promise<void>;
  incrementReplyCount(parentId: string): Promise<void>;
  decrementReplyCount(parentId: string): Promise<void>;
  countReplies(parentId: string): Promise<number>;
  incrementLikeCount(commentId: string): Promise<void>;
  decrementLikeCount(commentId: string): Promise<void>;
  /**
   * Resolves display names for a page of comments in ONE query.
   *
   * `CommentResponse.authorName` is a required string in the shared contract and the frontend
   * renders it, but `comments` stores only `author_id`. Reading a name per row would be an N+1 on
   * a public, uncached, paginated endpoint, so the service passes the page's distinct author ids
   * here once and maps the result. `StoriesRepository.findAuthorsByIds` and
   * `ConversationsRepository.findParticipantsByIds` are the same shape for the same reason.
   */
  findAuthorsByIds(authorIds: string[]): Promise<CommentAuthorSummary[]>;
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
  findByComment(
    commentId: string,
    page: number,
    limit: number,
  ): Promise<{ reactions: CommentReaction[]; total: number }>;
  create(data: { userId: string; commentId: string; type: string }): Promise<CommentReaction>;
  /**
   * A second POST for the same (user, comment) is a TYPE CHANGE, not a conflict:
   * \`comment_reactions_unique_idx\` admits exactly one reaction per pair, so there is nowhere for a
   * second row to go. Without this the only way to change a comment reaction over HTTP was
   * DELETE then POST.
   */
  update(id: string, data: { type: string }): Promise<CommentReaction>;
  delete(id: string): Promise<void>;
  deleteByUserAndComment(userId: string, commentId: string): Promise<void>;
  countReactions(commentId: string): Promise<number>;
}
