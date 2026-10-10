import { Injectable, NotFoundException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { StoryReactedEvent, StoryReactionRemovedEvent } from '../../common/events/social.events.ts';

import type { IReactionsRepository } from './interfaces/reactions-repository.interface.ts';
import { REACTIONS_REPOSITORY } from './interfaces/reactions-repository.interface.ts';
import type { Reaction, ReactionCounts } from './types.ts';
import { VALID_REACTION_TYPES } from './types.ts';

type ReactionType = (typeof VALID_REACTION_TYPES)[number];

@Injectable()
export class ReactionsService {
  constructor(
    @Inject(REACTIONS_REPOSITORY) private readonly reactionsRepository: IReactionsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async addReaction(userId: string, storyId: string, type: string): Promise<Reaction> {
    if (!VALID_REACTION_TYPES.includes(type as ReactionType)) {
      throw new NotFoundException('Invalid reaction type');
    }

    const existing = await this.reactionsRepository.findByUserAndStory(userId, storyId);
    if (existing) {
      const updated = await this.reactionsRepository.update(existing.id, { type });
      return updated;
    }

    const reaction = await this.reactionsRepository.create({ userId, storyId, type });
    await this.eventBus.emit('story.reacted', { userId, storyId, reactionType: type } as StoryReactedEvent);
    return reaction;
  }

  async removeReaction(userId: string, storyId: string): Promise<void> {
    const existing = await this.reactionsRepository.findByUserAndStory(userId, storyId);
    if (!existing) {
      throw new NotFoundException('Reaction not found');
    }

    await this.reactionsRepository.deleteByUserAndStory(userId, storyId);
    await this.eventBus.emit('story.reaction.removed', { userId, storyId } as StoryReactionRemovedEvent);
  }

  async getReactions(
    storyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ reactions: Reaction[]; total: number; page: number; limit: number }> {
    const { reactions, total } = await this.reactionsRepository.findReactionsByStory(storyId, page, limit);

    return { reactions, total, page, limit };
  }

  /**
   * One grouped query, not one query per type.
   *
   * This looped `VALID_REACTION_TYPES` and awaited `countReactionsByType` six times in sequence, so the
   * cost of reading a story's reaction row was six fixed round trips against a `@Public()` route that
   * every story card hits — the N+1 pattern with a constant N, which is still N+1.
   *
   * WHY THE ZEROS ARE ADDED HERE. `GROUP BY type` returns only the types that have rows, so a story
   * nobody reacted to comes back as `{}`. The client renders all six keys and the repository has no
   * way to know which six are valid — that list belongs to this module's `VALID_REACTION_TYPES`
   * (Principle #9), so the shape is completed here rather than by the query.
   */
async getReactionCounts(storyId: string): Promise<ReactionCounts> {
    const counted = await this.reactionsRepository.countByType(storyId);

    const counts: ReactionCounts = {};
    for (const type of VALID_REACTION_TYPES) {
      counts[type] = counted[type] ?? 0;
    }
    return counts;
  }

  async getUserReaction(userId: string, storyId: string): Promise<Reaction | null> {
    return this.reactionsRepository.findByUserAndStory(userId, storyId);
  }
}
