import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { StoryReactedEvent, StoryReactionRemovedEvent } from '../../../common/events/social.events.ts';
import type { IReactionsRepository } from '../interfaces/reactions-repository.interface.ts';
import { REACTIONS_REPOSITORY } from '../interfaces/reactions-repository.interface.ts';

@Injectable()
export class ReactionsEventHandler {
  constructor(
    @Inject(REACTIONS_REPOSITORY) private readonly reactionsRepository: IReactionsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('story.reacted')
  async handleStoryReacted(event: StoryReactedEvent): Promise<void> {
    this.logger.info(`User ${event.userId} reacted to story ${event.storyId} with ${event.reactionType}`, 'ReactionsEventHandler');
  }

  @OnEvent('story.reaction.removed')
  async handleStoryReactionRemoved(event: StoryReactionRemovedEvent): Promise<void> {
    this.logger.info(`User ${event.userId} removed reaction from story ${event.storyId}`, 'ReactionsEventHandler');
  }
}
