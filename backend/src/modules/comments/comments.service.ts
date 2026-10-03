import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type {
  CommentCreatedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
} from '../../common/events/social.events.ts';

import type { ICommentsRepository, CommentAuthorSummary } from './interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from './interfaces/comments-repository.interface.ts';
import type { Comment, CreateCommentInput, UpdateCommentInput, CommentResponse } from './types.ts';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  /**
   * WHY THE PARENT IS VALIDATED HERE AND NOT BY A CONSTRAINT.
   *
   * The self-referencing foreign key only proves the id exists in `comments`. It says nothing about
   * which story the parent belongs to, whether the parent is still readable, or how deep the thread
   * is — and all three failures are silent:
   *
   *  - a cross-story `parentId` satisfies the FK and produces a reply that is listed under a story
   *    it does not belong to, and is invisible from the other one;
   *  - an unknown but well-formed UUID satisfies the FK and produces a row nobody can ever reach,
   *    while `incrementReplyCount` quietly updates 0 rows;
   *  - a soft-deleted parent raises a counter for a thread nobody can read, and `findReplies`
   *    filters deleted rows, so the counter and the listing then disagree forever.
   *
   * WHY DEPTH 2 IS A `parentId IS NULL` CHECK AND NOT A WALK. `comments` has no depth column, so
   * the general answer is a recursive CTE. It is not needed: the read side is already two levels —
   * `findByStory` returns only `parent_id IS NULL` and `findReplies` returns only direct children —
   * so a third level is unreachable through this API whatever the column says. Enforcing the bound
   * therefore costs one comparison and turns a write-time possibility into a stated invariant.
   */
  async create(input: CreateCommentInput): Promise<Comment> {
    if (input.parentId) {
      const parent = await this.commentsRepository.findById(input.parentId);
      if (!parent || parent.isDeleted) {
        throw new NotFoundException('Parent comment not found');
      }
      if (parent.storyId !== input.storyId) {
        throw new BadRequestException('Parent comment belongs to a different story');
      }
      if (parent.parentId !== null) {
        throw new BadRequestException('Replies cannot be nested more than two levels deep');
      }
    }

    const comment = await this.commentsRepository.create(input);

    if (input.parentId) {
      await this.commentsRepository.incrementReplyCount(input.parentId);
    }

    await this.eventBus.emit('comment.created', {
      commentId: comment.id,
      storyId: comment.storyId,
      authorId: comment.authorId,
      parentId: input.parentId,
    } as CommentCreatedEvent);

    return comment;
  }

  async findById(id: string): Promise<Comment> {
    const comment = await this.commentsRepository.findById(id);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  async findByStory(
    storyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ comments: CommentResponse[]; total: number; page: number; limit: number }> {
    const result = await this.commentsRepository.findByStory(storyId, page, limit);
    const authorsById = await this.loadAuthorNames(result.comments);
    return {
      comments: result.comments.map((comment: Comment) => this.toCommentResponse(comment, authorsById)),
      total: result.total,
      page,
      limit,
    };
  }

  async findReplies(
    parentId: string,
    page = 1,
    limit = 20,
  ): Promise<{ replies: CommentResponse[]; total: number; page: number; limit: number }> {
    const result = await this.commentsRepository.findReplies(parentId, page, limit);
    const authorsById = await this.loadAuthorNames(result.replies);
    return {
      replies: result.replies.map((reply: Comment) => this.toCommentResponse(reply, authorsById)),
      total: result.total,
      page,
      limit,
    };
  }

  async update(id: string, authorId: string, input: UpdateCommentInput): Promise<Comment> {
    const comment = await this.commentsRepository.findById(id);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updated = await this.commentsRepository.update(id, input);
    await this.eventBus.emit('comment.updated', { commentId: id, storyId: comment.storyId } as CommentUpdatedEvent);
    return updated;
  }

  async delete(id: string, authorId: string): Promise<void> {
    const comment = await this.commentsRepository.findById(id);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== authorId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    // The parent's counter was raised by this comment's own creation, so the same service that
    // raised it lowers it. `comment.parentId` is already in hand from the read above, so this costs
    // no extra query. Without it the counter only ever climbs, and `replyCount` is rendered
    // directly to the client next to an empty replies list.
    if (comment.parentId) {
      await this.commentsRepository.decrementReplyCount(comment.parentId);
    }

    await this.commentsRepository.softDelete(id);
    await this.eventBus.emit('comment.deleted', { commentId: id, storyId: comment.storyId } as CommentDeletedEvent);
  }

  /**
   * WHY BATCHED AND NOT PER COMMENT. The alternative is one lookup per row, which is 20 round
   * trips at the default page size, on a public and uncached endpoint. `StoriesService` and
   * `MessagesService` both already do the batched form for the same reason.
   */
  private async loadAuthorNames(rows: readonly Comment[]): Promise<Map<string, string>> {
    const authorIds = [...new Set(rows.map((row) => row.authorId))];
    if (authorIds.length === 0) {
      return new Map();
    }
    const authors = await this.commentsRepository.findAuthorsByIds(authorIds);
    return new Map(authors.map((author: CommentAuthorSummary) => [author.id, author.name]));
  }

  /**
   * WHY THE FALLBACK IS STILL `''`. `comments.author_id` is `NOT NULL REFERENCES users(id)`, so
   * the only way to reach this without a name is a row the `users` table no longer holds. An empty
   * string is the honest "no name" — the alternative, a placeholder like "Unknown", would render as
   * a real author's name in the UI and be indistinguishable from one.
   */
  private toCommentResponse(comment: Comment, authorsById: Map<string, string>): CommentResponse {
    return {
      id: comment.id,
      storyId: comment.storyId,
      authorId: comment.authorId,
      authorName: authorsById.get(comment.authorId) ?? '',
      parentId: comment.parentId,
      content: comment.content,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }
}
