import { Injectable, NotFoundException, Inject, Optional } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { badges, userBadges } from '../../db/schema/badges.schema.ts';
import { moderationActions } from '../../db/schema/moderation.schema.ts';
import { follows } from '../../db/schema/social.schema.ts';
import { stories } from '../../db/schema/stories.schema.ts';
import { contests } from '../../db/schema/contests.schema.ts';
import { db } from '../../db/index.ts';
import { NotificationsService } from '../notifications/notifications.service.ts';

import {
  BADGE_RULES,
  meetsThreshold,
  rulesForTrigger,
  type BadgeMetric,
  type BadgeTriggerEvent,
} from './badge-rules.config.ts';

/** Postgres `unique_violation`. Raised when two awards race past the existence check. */
const PG_UNIQUE_VIOLATION = '23505';

export const BADGE_NOTIFICATION_TYPE = 'badge.awarded';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION;
}

export interface AwardedBadge {
  id: string;
  badgeId: string;
  badgeKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  awardedAt: Date;
}

export interface BadgeCatalogEntry {
  key: string;
  name: string;
  description: string;
  icon: string;
  trigger: BadgeTriggerEvent;
  threshold: number;
}

type BadgeRow = typeof badges.$inferSelect;
type UserBadgeRow = typeof userBadges.$inferSelect;

function mapAwarded(row: UserBadgeRow, badge: BadgeRow): AwardedBadge {
  return {
    id: row.id,
    badgeId: row.badgeId,
    badgeKey: badge.name,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    awardedAt: row.awardedAt,
  };
}

@Injectable()
export class BadgesService {
  /**
   * `@Optional` because a badge award is worth recording even where the notifications module
   * is not wired in (a worker process, a test harness). The award itself never depends on it.
   */
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async listCatalog(): Promise<BadgeCatalogEntry[]> {
    return BADGE_RULES.map((rule) => ({
      key: rule.badgeKey,
      name: rule.name,
      description: rule.description,
      icon: rule.icon,
      trigger: rule.trigger,
      threshold: rule.threshold,
    }));
  }

  async findByUser(userId: string): Promise<AwardedBadge[]> {
    const rows = await db
      .select({ userBadge: userBadges, badge: badges })
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.awardedAt));

    return rows.map((row) => mapAwarded(row.userBadge, row.badge));
  }

  async findByUserAndKey(userId: string, badgeKey: string): Promise<AwardedBadge> {
    const catalog = BADGE_RULES.find((rule) => rule.badgeKey === badgeKey);
    if (!catalog) {
      throw new NotFoundException('Badge not found');
    }

    const rows = await db
      .select({ userBadge: userBadges, badge: badges })
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(and(eq(userBadges.userId, userId), eq(badges.name, catalog.name)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Badge not found');
    }
    return mapAwarded(row.userBadge, row.badge);
  }

  async evaluateForUser(userId: string, trigger: BadgeTriggerEvent): Promise<AwardedBadge[]> {
    const rules = rulesForTrigger(trigger);
    if (rules.length === 0) {
      return [];
    }

    const awarded: AwardedBadge[] = [];
    for (const rule of rules) {
      const value = await this.measure(userId, rule.metric);
      if (!meetsThreshold(value, rule)) {
        continue;
      }
      const result = await this.award(userId, rule.badgeKey, rule.name, rule.description, rule.icon);
      if (result) {
        awarded.push(result);
      }
    }
    return awarded;
  }

  async award(
    userId: string,
    badgeKey: string,
    name: string,
    description: string,
    icon: string,
  ): Promise<AwardedBadge | null> {
    const badge = await this.resolveBadge(badgeKey, name, description, icon);
    const existing = await db
      .select({ id: userBadges.id })
      .from(userBadges)
      .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badge.id)))
      .limit(1);

    if (existing.length > 0) {
      return null;
    }

    const inserted = await this.insertAward(userId, badge);
    if (!inserted) {
      // Another request awarded the same badge between the check above and this insert.
      return null;
    }

    this.logger.info(`Awarded badge ${badgeKey} to user ${userId}`, 'BadgesService');
    await this.announceAward(userId, badgeKey, name, description);

    return mapAwarded(inserted, badge);
  }

  /**
   * The existence check above is advisory: two concurrent awards both pass it and both reach
   * the insert, so `user_badges_unique_idx` is what actually guarantees one row. Losing that
   * race is a normal outcome of "this user already has the badge", not a server fault, so it
   * is caught and reported as the same "nothing new happened" the check would have returned.
   */
  private async insertAward(userId: string, badge: BadgeRow): Promise<UserBadgeRow | null> {
    try {
      const [inserted] = await db.insert(userBadges).values({ userId, badgeId: badge.id }).returning();
      return inserted ?? null;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      this.logger.info(`Badge already awarded to user ${userId} concurrently; ignoring the duplicate`, 'BadgesService');
      return null;
    }
  }

  /**
   * Records the award as a notification the user can actually see.
   *
   * This used to emit `notification.created` with the `user_badges` row id in the
   * `notificationId` field. The payload validated, so nothing was dead-lettered, but the only
   * subscriber for that name just logs — no row was ever written to `notifications`, so a
   * badge award was structurally invisible.
   *
   * `NotificationsService` is the notifications module's published interface and the only path
   * that writes the row, so the award goes through it. It emits `notification.created` itself,
   * with the real notification id, so this method deliberately does not emit that event too —
   * two announcements of one notification is how a duplicate row gets written.
   *
   * A failure here is logged and swallowed: the award is already committed, and a badge
   * notification is eventual-consistency material, not an audit trail (principles #14/#16).
   */
  private async announceAward(userId: string, badgeKey: string, name: string, description: string): Promise<void> {
    if (!this.notificationsService) {
      this.logger.warn(
        `Badge ${badgeKey} awarded to ${userId} but no notifications module is wired in`,
        'BadgesService',
      );
      return;
    }

    try {
      await this.notificationsService.create({
        userId,
        type: BADGE_NOTIFICATION_TYPE,
        title: `Badge earned: ${name}`,
        message: description,
        data: JSON.stringify({ badgeKey }),
      });
    } catch (error) {
      this.logger.error(
        `Could not record the badge notification for ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'BadgesService',
      );
    }
  }

  async awardManual(userId: string, badgeKey: string): Promise<AwardedBadge> {
    const rule = BADGE_RULES.find((entry) => entry.badgeKey === badgeKey);
    if (!rule) {
      throw new NotFoundException('Badge not found');
    }
    const awarded = await this.award(userId, rule.badgeKey, rule.name, rule.description, rule.icon);
    if (awarded) {
      return awarded;
    }
    return this.findByUserAndKey(userId, rule.badgeKey);
  }

  private async resolveBadge(badgeKey: string, name: string, description: string, icon: string): Promise<BadgeRow> {
    const [existing] = await db.select().from(badges).where(eq(badges.name, name)).limit(1);
    if (existing) {
      return existing;
    }

    const [created] = await db.insert(badges).values({ name, description, icon, criteria: badgeKey }).returning();
    return created;
  }

  private async measure(userId: string, metric: BadgeMetric): Promise<number> {
    switch (metric) {
      case 'contest_wins':
        return this.countContestWins(userId);
      case 'published_stories':
        return this.countPublishedStories(userId);
      case 'follower_count':
        return this.countFollowers(userId);
      case 'moderation_actions':
        return this.countModerationActions(userId);
      default:
        return 0;
    }
  }

  private async countContestWins(userId: string): Promise<number> {
    const [result] = await db.select({ total: count() }).from(contests).where(eq(contests.winnerId, userId));
    return Number(result?.total ?? 0);
  }

  private async countPublishedStories(userId: string): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(stories)
      .where(and(eq(stories.authorId, userId), eq(stories.status, 'published'), isNull(stories.deletedAt)));
    return Number(result?.total ?? 0);
  }

  private async countFollowers(userId: string): Promise<number> {
    const [result] = await db.select({ total: count() }).from(follows).where(eq(follows.followingId, userId));
    return Number(result?.total ?? 0);
  }

  private async countModerationActions(userId: string): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(moderationActions)
      .where(eq(moderationActions.adminId, userId));
    return Number(result?.total ?? 0);
  }
}

export const BADGE_KEYS = BADGE_RULES.map((rule) => rule.badgeKey);
