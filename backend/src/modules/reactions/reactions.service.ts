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

  async getReactions(storyId: string, page = 1, limit = 20): Promise<{ reactions: Reaction[]; total: number }> {
    return this.reactionsRepository.findReactionsByStory(storyId, page, limit);
  }

  async getReactionCounts(storyId: string): Promise<ReactionCounts> {
    const counts: ReactionCounts = {};
    for (const type of VALID_REACTION_TYPES) {
      counts[type] = await this.reactionsRepository.countReactionsByType(storyId, type);
    }
    return counts;
  }

  async getUserReaction(userId: string, storyId: string): Promise<Reaction | null> {
    return this.reactionsRepository.findByUserAndStory(userId, storyId);
  }
}
