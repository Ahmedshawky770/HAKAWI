import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { CommentCreatedEvent, CommentUpdatedEvent, CommentDeletedEvent } from '../../../common/events/social.events.ts';
import type { ICommentsRepository } from '../interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';

@Injectable()
export class CommentsEventHandler {
  constructor(
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('comment.created')
  async handleCommentCreated(event: CommentCreatedEvent): Promise<void> {
    this.logger.info(`Comment ${event.commentId} created on story ${event.storyId} by user ${event.authorId}`, 'CommentsEventHandler');
  }

  @OnEvent('comment.updated')
  async handleCommentUpdated(event: CommentUpdatedEvent): Promise<void> {
    this.logger.info(`Comment ${event.commentId} updated on story ${event.storyId}`, 'CommentsEventHandler');
  }

  @OnEvent('comment.deleted')
  async handleCommentDeleted(event: CommentDeletedEvent): Promise<void> {
    this.logger.info(`Comment ${event.commentId} deleted from story ${event.storyId}`, 'CommentsEventHandler');
  }
}
