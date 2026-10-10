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
    // A soft-deleted comment is a tombstone: `CommentsService.findById` rejects it with a 404 and
    // `findReplies` filters it out, so a reaction on one is stored against something the author can
    // never open and nobody can ever see listed.
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    const existing = await this.commentReactionsRepository.findByUserAndComment(userId, commentId);
    if (existing) {
      // `comment_reactions_unique_idx` admits exactly one reaction per (user, comment), so a repeat
      // POST is a type change and not a conflict. Throwing here made a comment reaction immutable
      // over HTTP: the only way to change one was DELETE then POST, which briefly removed it from
      // the count. This mirrors `ReactionsService.addReaction` for the story case.
      //
      // Nothing is emitted on the type change, exactly as in the story module. `comment.reacted`
      // means "a new reaction exists" and `CommentsEventHandler` increments the comment's
      // `like_count` on it; emitting it again would double-count.
      return this.commentReactionsRepository.update(existing.id, { type });
    }

    const reaction = await this.commentReactionsRepository.create({ userId, commentId, type });
    await this.eventBus.emit('comment.reacted', { userId, commentId, reactionType: type });
    return reaction;
  }

  async removeReaction(userId: string, commentId: string): Promise<void> {
    // The comment is checked before the reaction so that a reaction on a tombstoned comment cannot
    // be removed through a path that never looks at whether the comment still exists.
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    const existing = await this.commentReactionsRepository.findByUserAndComment(userId, commentId);
    if (!existing) {
      throw new NotFoundException('Reaction not found');
    }

    await this.commentReactionsRepository.deleteByUserAndComment(userId, commentId);
    await this.eventBus.emit('comment.reaction.removed', { userId, commentId });
  }

  async getReactions(
    commentId: string,
    page = 1,
    limit = 20,
  ): Promise<{ reactions: CommentReaction[]; total: number }> {
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }
    return this.commentReactionsRepository.findByComment(commentId, page, limit);
  }
}
