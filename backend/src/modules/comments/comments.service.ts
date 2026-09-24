import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { CommentCreatedEvent, CommentUpdatedEvent, CommentDeletedEvent } from '../../common/events/social.events.ts';

import type { ICommentsRepository } from './interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from './interfaces/comments-repository.interface.ts';
import type { Comment, CreateCommentInput, UpdateCommentInput, CommentResponse } from './types.ts';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async create(input: CreateCommentInput): Promise<Comment> {
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

  async findByStory(storyId: string, page = 1, limit = 20): Promise<{ comments: CommentResponse[]; total: number }> {
    const result = await this.commentsRepository.findByStory(storyId, page, limit);
    return {
      comments: result.comments.map((comment: Comment) => this.toCommentResponse(comment)),
      total: result.total,
    };
  }

  async findReplies(parentId: string, page = 1, limit = 20): Promise<{ replies: CommentResponse[]; total: number }> {
    const result = await this.commentsRepository.findReplies(parentId, page, limit);
    return {
      replies: result.replies.map((reply: Comment) => this.toCommentResponse(reply)),
      total: result.total,
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

    await this.commentsRepository.softDelete(id);
    await this.eventBus.emit('comment.deleted', { commentId: id, storyId: comment.storyId } as CommentDeletedEvent);
  }

  private toCommentResponse(comment: Comment): CommentResponse {
    return {
      id: comment.id,
      storyId: comment.storyId,
      authorId: comment.authorId,
      authorName: '',
      parentId: comment.parentId,
      content: comment.content,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }
}
