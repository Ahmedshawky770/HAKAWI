import { Injectable, NotFoundException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { ICommentsRepository } from '../interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';
import type { ICommentReactionsRepository, CommentReaction } from '../interfaces/comments-repository.interface.ts';
import { COMMENT_REACTIONS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';
import { VALID_REACTION_TYPES } from '../../../modules/reactions/types.ts';

type ReactionType = (typeof VALID_REACTION_TYPES)[number];

@Injectable()
export class CommentReactionsService {
  constructor(
    @Inject(COMMENT_REACTIONS_REPOSITORY) private readonly commentReactionsRepository: ICommentReactionsRepository,
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async addReaction(userId: string, commentId: string, type: string): Promise<CommentReaction> {
    if (!VALID_REACTION_TYPES.includes(type as ReactionType)) {
      throw new NotFoundException('Invalid reaction type');
    }

    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const existing = await this.commentReactionsRepository.findByUserAndComment(userId, commentId);
    if (existing) {
      throw new NotFoundException('Reaction already exists');
    }

    const reaction = await this.commentReactionsRepository.create({ userId, commentId, type });
    await this.eventBus.emit('comment.reacted', { userId, commentId, reactionType: type });
    return reaction;
  }

  async removeReaction(userId: string, commentId: string): Promise<void> {
    const existing = await this.commentReactionsRepository.findByUserAndComment(userId, commentId);
    if (!existing) {
      throw new NotFoundException('Reaction not found');
    }

    await this.commentReactionsRepository.deleteByUserAndComment(userId, commentId);
    await this.eventBus.emit('comment.reaction.removed', { userId, commentId });
  }

  async getReactions(commentId: string, page = 1, limit = 20): Promise<{ reactions: CommentReaction[]; total: number }> {
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return this.commentReactionsRepository.findByComment(commentId, page, limit);
  }
}
