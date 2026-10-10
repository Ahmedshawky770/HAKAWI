import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { StoryReactedEvent, StoryReactionRemovedEvent } from '../../../common/events/social.events.ts';

/**
 * `REACTIONS_REPOSITORY` used to be injected here and never read — both handlers only log. Same reason
 * as `FollowsEventHandler`: an injected-but-unused repository makes an observer look like the owner of
 * the write side, and it would keep a repository binding alive for a class that never calls it.
 */
@Injectable()
export class ReactionsEventHandler {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  @OnEvent('story.reacted')
  async handleStoryReacted(event: StoryReactedEvent): Promise<void> {
    this.logger.info(
      `User ${event.userId} reacted to story ${event.storyId} with ${event.reactionType}`,
      'ReactionsEventHandler',
    );
  }

  @OnEvent('story.reaction.removed')
  async handleStoryReactionRemoved(event: StoryReactionRemovedEvent): Promise<void> {
    this.logger.info(`User ${event.userId} removed reaction from story ${event.storyId}`, 'ReactionsEventHandler');
  }
}
