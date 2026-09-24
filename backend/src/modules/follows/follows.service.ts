import { Injectable, NotFoundException, ConflictException, Inject, BadRequestException } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { UserFollowedEvent, UserUnfollowedEvent } from '../../common/events/social.events.ts';

import type { IFollowsRepository } from './interfaces/follows-repository.interface.ts';
import { FOLLOWS_REPOSITORY } from './interfaces/follows-repository.interface.ts';
import type { Follow, FollowStats } from './types.ts';

@Injectable()
export class FollowsService {
  constructor(
    @Inject(FOLLOWS_REPOSITORY) private readonly followsRepository: IFollowsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async follow(followerId: string, followingId: string): Promise<Follow> {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const existing = await this.followsRepository.findByUsers(followerId, followingId);
    if (existing) {
      throw new ConflictException('Already following this user');
    }

    const follow = await this.followsRepository.create({ followerId, followingId });
    await this.eventBus.emit('user.followed', { followerId, followingId } as UserFollowedEvent);
    return follow;
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    const existing = await this.followsRepository.findByUsers(followerId, followingId);
    if (!existing) {
      throw new NotFoundException('Not following this user');
    }

    await this.followsRepository.delete(existing.id);
    await this.eventBus.emit('user.unfollowed', { followerId, followingId } as UserUnfollowedEvent);
  }

  async getFollowers(userId: string, page = 1, limit = 20): Promise<{ follows: Follow[]; total: number }> {
    return this.followsRepository.findFollowers(userId, page, limit);
  }

  async getFollowing(userId: string, page = 1, limit = 20): Promise<{ follows: Follow[]; total: number }> {
    return this.followsRepository.findFollowing(userId, page, limit);
  }

  async getStats(userId: string, currentUserId?: string): Promise<FollowStats> {
    const [followersCount, followingCount, isFollowing] = await Promise.all([
      this.followsRepository.countFollowers(userId),
      this.followsRepository.countFollowing(userId),
      currentUserId ? this.followsRepository.isFollowing(currentUserId, userId) : Promise.resolve(false),
    ]);

    return {
      followersCount,
      followingCount,
      isFollowing: Boolean(isFollowing),
    };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    return this.followsRepository.isFollowing(followerId, followingId);
  }
}
