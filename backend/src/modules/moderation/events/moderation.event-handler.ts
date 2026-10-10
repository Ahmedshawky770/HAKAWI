import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import {
  ModerationActionTakenEvent,
  ModerationReportEscalatedEvent,
} from '../../../common/events/moderation.events.ts';
import { userRestrictions } from '../../../db/schema/moderation.schema.ts';
import { db } from '../../../db/index.ts';

/**
 * The two moderation actions that actually restrict an account, and the one vocabulary both stores
 * use.
 *
 * `ModerationActionDto.action` is `'warn' | 'mute' | 'ban' | 'content_removal' | 'no_action'`, and
 * three of those are not restrictions at all: a `warn` is a note, `content_removal` is a decision
 * about one piece of content, and `no_action` is the absence of a decision.
 *
 * `ModerationService` has always normalised the same fact for the `user_restrictions` table — to
 * `mute`, `ban`, or `warning`. This handler did NOT: it wrote the raw action into Valkey, so
 * `restriction:<userId>` held `'warn'` for a warned account. `RestrictionGuard` was never applied to
 * any route, so that mismatch was invisible — but it is the reason the guard could not simply be
 * wired up as written. A guard that treats any present key as a denial would have turned every
 * warning, every content removal and every no-op decision into a total account lockout.
 *
 * Using one vocabulary for both stores is the fix: the table and the cache can no longer disagree
 * about what an action means, and the guard only has to understand two values.
 */
const RESTRICTING_ACTIONS: ReadonlySet<string> = new Set(['ban', 'mute']);

/** A ban expires in a day; every other restriction is treated as a month. */
const BAN_TTL_SECONDS = 24 * 60 * 60;
const OTHER_RESTRICTION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The stored vocabulary. Kept as an explicit map rather than a cast so that an action name added to
 * `ModerationActionDto` without a decision here shows up as `undefined` at runtime — a value no
 * consumer treats as a restriction — instead of being written through unchanged.
 */
const STORED_RESTRICTION_TYPE: Readonly<Record<string, string>> = {
  ban: 'ban',
  mute: 'mute',
};

@Injectable()
export class ModerationEventHandler {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
  ) {}

  @OnEvent('moderation.action.taken')
  async handleModerationActionTaken(event: ModerationActionTakenEvent): Promise<void> {
    this.logger.info(
      `Handling moderation action taken: ${event.action} on user ${event.targetUserId}`,
      'ModerationEventHandler',
    );

    // A non-restricting action still records its audit row, so the moderation timeline keeps the
    // decision. It does NOT touch the restriction cache: leaving a key behind for a `warn` would mean
    // the next unrelated read by that account met a stale restriction, and `content_removal` is not
    // about the account at all.
    const storedType = STORED_RESTRICTION_TYPE[event.action];
    if (storedType === undefined) {
      this.logger.info(
        `Moderation action '${event.action}' on user ${event.targetUserId} is not an account restriction; restriction cache untouched`,
        'ModerationEventHandler',
      );
      this.recordAuditRow(event);
      return;
    }

    const restrictionKey = `restriction:${event.targetUserId}`;
    const ttlSeconds = event.action === 'ban' ? BAN_TTL_SECONDS : OTHER_RESTRICTION_TTL_SECONDS;

    await this.valkeyService.set(restrictionKey, storedType, ttlSeconds);

    await this.valkeyService.hSetMultiple(`restriction:${event.targetUserId}:details`, {
      type: storedType,
      reason: event.reason,
      actionId: event.actionId,
      adminId: event.adminId,
      createdAt: new Date().toISOString(),
    });

    await this.valkeyService.expire(`restriction:${event.targetUserId}:details`, ttlSeconds);

    this.recordAuditRow(event, storedType, ttlSeconds);
  }

  /**
   * Writes the `user_restrictions` audit row.
   *
   * The existing row is not replaced — a second action against an already-restricted account leaves
   * the first decision in place, which is the behaviour before this change and the safer one: an
   * administrative restriction is lifted deliberately or by expiry, not as a side effect of an
   * unrelated later decision.
   */
  private async recordAuditRow(
    event: ModerationActionTakenEvent,
    storedType?: string,
    ttlSeconds?: number,
  ): Promise<void> {
    const expiresAt =
      ttlSeconds !== undefined
        ? new Date(Date.now() + ttlSeconds * 1000)
        : new Date(Date.now() + OTHER_RESTRICTION_TTL_SECONDS * 1000);

    const [existing] = await db.select().from(userRestrictions).where(eq(userRestrictions.userId, event.targetUserId));

    if (existing) {
      return;
    }

    await db.insert(userRestrictions).values({
      userId: event.targetUserId,
      // `warning` is the vocabulary the table already used for anything that is not a ban or a mute;
      // a non-restricting action is exactly that, and `storedType` is undefined for all of them.
      type: storedType ?? 'warning',
      reason: event.reason,
      expiresAt,
      createdBy: event.adminId,
    });
  }

  @OnEvent('moderation.report.escalated')
  async handleModerationReportEscalated(event: ModerationReportEscalatedEvent): Promise<void> {
    this.logger.info(`Handling moderation report escalated: report ${event.reportId}`, 'ModerationEventHandler');

    const restrictionKey = `escalation:${event.targetId}`;
    await this.valkeyService.set(
      restrictionKey,
      JSON.stringify({
        reportId: event.reportId,
        status: 'escalated',
        escalatedAt: new Date().toISOString(),
      }),
      48 * 60 * 60,
    );
  }
}
