import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import {
  ModerationActionTakenEvent,
  ModerationReportEscalatedEvent,
} from '../../../common/events/moderation.events.ts';
import { RESTRICTION_TYPE_BY_ACTION, restrictionTtlSeconds } from '../restriction-policy.ts';

/**
 * What this handler enforces, and what it deliberately does not.
 *
 * WHY THE VOCABULARY AND THE TTL COME FROM ELSEWHERE. `restriction-policy.ts` owns both, because
 * they used to live here and `ModerationService` wrote a different answer for the same action: the
 * service normalised the action into the table's vocabulary and honoured the moderator's duration,
 * while this handler wrote the raw action into Valkey under a fixed TTL. `RestrictionGuard` reads
 * Valkey only, so a seven-day ban was lifted after twenty-four hours and a warned account had a
 * restriction key at all.
 *
 * WHY THIS HANDLER NO LONGER WRITES `user_restrictions`. It was a second writer of that table with
 * its own expiry rule — never the same rule as the service's, by construction, because it derived
 * the expiry from the fixed TTLs rather than from the action's duration. Two writers of one row is
 * how the audit trail ends up contradicting what is enforced. `ModerationService` is now the single
 * writer, and every decision behind the row — which action restricts, which type it is stored as,
 * how long it lasts — is read from the shared policy by both sides.
 */
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

    // A non-restricting action still leaves its decision in `moderation_actions`, which the service
    // writes for every action, so the moderation timeline keeps it. It does NOT touch the
    // restriction cache: leaving a key behind for a `warn` would mean the next unrelated read by
    // that account met a stale restriction, and `content_removal` is not about the account at all.
    const storedType = RESTRICTION_TYPE_BY_ACTION[event.action];
    if (storedType === undefined) {
      this.logger.info(
        `Moderation action '${event.action}' on user ${event.targetUserId} is not an account restriction; restriction cache untouched`,
        'ModerationEventHandler',
      );
      return;
    }

    const restrictionKey = `restriction:${event.targetUserId}`;
    // The duration the moderator chose is the TTL; the policy supplies the fallback when the action
    // carried none. The service writes the same answer into `user_restrictions.expires_at`.
    const ttlSeconds = restrictionTtlSeconds(event.action, event.durationMinutes);

    await this.valkeyService.set(restrictionKey, storedType, ttlSeconds);

    await this.valkeyService.hSetMultiple(`restriction:${event.targetUserId}:details`, {
      type: storedType,
      reason: event.reason,
      actionId: event.actionId,
      adminId: event.adminId,
      createdAt: new Date().toISOString(),
    });

    await this.valkeyService.expire(`restriction:${event.targetUserId}:details`, ttlSeconds);
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
