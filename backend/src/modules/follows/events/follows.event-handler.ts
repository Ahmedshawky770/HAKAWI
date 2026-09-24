import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { UserFollowedEvent, UserUnfollowedEvent } from '../../../common/events/social.events.ts';
import type { IFollowsRepository } from '../interfaces/follows-repository.interface.ts';
import { FOLLOWS_REPOSITORY } from '../interfaces/follows-repository.interface.ts';

@Injectable()
export class FollowsEventHandler {
  constructor(
    @Inject(FOLLOWS_REPOSITORY) private readonly followsRepository: IFollowsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('user.followed')
  async handleUserFollowed(event: UserFollowedEvent): Promise<void> {
    this.logger.info(`User ${event.followerId} followed ${event.followingId}`, 'FollowsEventHandler');
  }

  @OnEvent('user.unfollowed')
  async handleUserUnfollowed(event: UserUnfollowedEvent): Promise<void> {
    this.logger.info(`User ${event.followerId} unfollowed ${event.followingId}`, 'FollowsEventHandler');
  }
}
