import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { ContestCompletedEvent, WinnerSelectedEvent } from '../../../common/events/contests.events.ts';
import type { StoryPublishedEvent } from '../../../common/events/stories.events.ts';
import type { UserFollowedEvent } from '../../../common/events/social.events.ts';
import type { ModerationActionTakenEvent } from '../../../common/events/moderation.events.ts';
import { stories } from '../../../db/schema/stories.schema.ts';
import { db } from '../../../db/index.ts';

import { BadgesService } from '../badges.service.ts';

/**
 * Badge awards are driven entirely by the event bus (Principle #7), so no module
 * has to know badges exist to win one.
 */
@Injectable()
export class BadgesEventHandler {
  constructor(
    @Inject(BadgesService) private readonly badgesService: BadgesService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('winner.selected')
  async handleWinnerSelected(event: WinnerSelectedEvent): Promise<void> {
    await this.safely('winner.selected', event.winnerId, () =>
      this.badgesService.evaluateForUser(event.winnerId, 'winner.selected'),
    );
  }

  @OnEvent('contest.completed')
  async handleContestCompleted(event: ContestCompletedEvent): Promise<void> {
    const winnerId = event.winnerId;
    if (winnerId === null) {
      return;
    }
    await this.safely('contest.completed', winnerId, () =>
      this.badgesService.evaluateForUser(winnerId, 'contest.completed'),
    );
  }

  @OnEvent('story.published')
  async handleStoryPublished(event: StoryPublishedEvent): Promise<void> {
    const [story] = await db
      .select({ authorId: stories.authorId })
      .from(stories)
      .where(eq(stories.id, event.storyId))
      .limit(1);

    if (!story) {
      this.logger.warn(`Cannot award a publication badge: story ${event.storyId} is gone`, 'BadgesEventHandler');
      return;
    }

    await this.safely('story.published', story.authorId, () =>
      this.badgesService.evaluateForUser(story.authorId, 'story.published'),
    );
  }

  @OnEvent('user.followed')
  async handleUserFollowed(event: UserFollowedEvent): Promise<void> {
    await this.safely('user.followed', event.followingId, () =>
      this.badgesService.evaluateForUser(event.followingId, 'user.followed'),
    );
  }

  @OnEvent('moderation.action.taken')
  async handleModerationActionTaken(event: ModerationActionTakenEvent): Promise<void> {
    await this.safely('moderation.action.taken', event.adminId, () =>
      this.badgesService.evaluateForUser(event.adminId, 'moderation.action.taken'),
    );
  }

  private async safely(trigger: string, userId: string, run: () => Promise<unknown>): Promise<void> {
    try {
      const awarded = await run();
      if (Array.isArray(awarded) && awarded.length > 0) {
        this.logger.info(`Awarded ${awarded.length} badge(s) to ${userId} after ${trigger}`, 'BadgesEventHandler');
      }
    } catch (error) {
      this.logger.error(
        `Badge evaluation failed for ${trigger} ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'BadgesEventHandler',
      );
    }
  }
}
