import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { UserFollowedEvent, UserUnfollowedEvent } from '../../../common/events/social.events.ts';

/**
 * `FOLLOWS_REPOSITORY` used to be injected here and never read — both handlers only log. An injected
 * but unused repository is not free: it makes this class look like the owner of follow side effects,
 * which is exactly the wrong signal for a class whose only job is to observe them, and it forces a
 * `FOLLOWS_REPOSITORY` provider to exist for a consumer that never asks the repository anything.
 */
@Injectable()
export class FollowsEventHandler {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  @OnEvent('user.followed')
  async handleUserFollowed(event: UserFollowedEvent): Promise<void> {
    this.logger.info(`User ${event.followerId} followed ${event.followingId}`, 'FollowsEventHandler');
  }

  @OnEvent('user.unfollowed')
  async handleUserUnfollowed(event: UserUnfollowedEvent): Promise<void> {
    this.logger.info(`User ${event.followerId} unfollowed ${event.followingId}`, 'FollowsEventHandler');
  }
}
