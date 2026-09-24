import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { ModerationActionTakenEvent, ModerationReportEscalatedEvent, UserRestrictedEvent } from '../../../common/events/moderation.events.ts';
import { reports, userRestrictions } from '../../../db/schema/moderation.schema.ts';
import { db } from '../../../db/index.ts';
import { AdminRole } from '../../../common/constants/roles.ts';

@Injectable()
export class ModerationEventHandler {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
  ) {}

  @OnEvent('moderation.action.taken')
  async handleModerationActionTaken(event: ModerationActionTakenEvent): Promise<void> {
    this.logger.info(`Handling moderation action taken: ${event.action} on user ${event.targetUserId}`, 'ModerationEventHandler');

    const restrictionKey = `restriction:${event.targetUserId}`;
    const restrictionTtl = event.action === 'ban' ? 24 * 60 * 60 : 30 * 24 * 60 * 60;

    await this.valkeyService.set(restrictionKey, event.action, restrictionTtl);

    await this.valkeyService.hSetMultiple(`restriction:${event.targetUserId}:details`, {
      type: event.action,
      reason: event.reason,
      actionId: event.actionId,
      adminId: event.adminId,
      createdAt: new Date().toISOString(),
    });

    await this.valkeyService.expire(`restriction:${event.targetUserId}:details`, restrictionTtl);

    const expiresAt = event.action === 'ban'
      ? new Date(Date.now() + restrictionTtl * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [existing] = await db.select().from(userRestrictions).where(eq(userRestrictions.userId, event.targetUserId));

    if (!existing) {
      await db.insert(userRestrictions).values({
        userId: event.targetUserId,
        type: event.action,
        reason: event.reason,
        expiresAt,
        createdBy: event.adminId,
      });
    }
  }

  @OnEvent('moderation.report.escalated')
  async handleModerationReportEscalated(event: ModerationReportEscalatedEvent): Promise<void> {
    this.logger.info(`Handling moderation report escalated: report ${event.reportId}`, 'ModerationEventHandler');

    const restrictionKey = `escalation:${event.targetId}`;
    await this.valkeyService.set(restrictionKey, JSON.stringify({
      reportId: event.reportId,
      status: 'escalated',
      escalatedAt: new Date().toISOString(),
    }), 48 * 60 * 60);
  }

  @OnEvent('user.restricted')
  async handleUserRestricted(event: UserRestrictedEvent): Promise<void> {
    this.logger.info(`Handling user restricted: user ${event.userId} restricted by ${event.restrictedBy}`, 'ModerationEventHandler');

    const restrictionKey = `restriction:${event.userId}`;
    const restrictionTtl = event.expiresAt
      ? Math.max(0, (event.expiresAt.getTime() - Date.now()) / 1000)
      : 48 * 60 * 60;

    await this.valkeyService.set(restrictionKey, event.type, restrictionTtl);

    await this.valkeyService.hSetMultiple(`restriction:${event.userId}:details`, {
      type: event.type,
      reason: event.reason,
      restrictedBy: event.restrictedBy,
      createdAt: new Date().toISOString(),
    });

    await this.valkeyService.expire(`restriction:${event.userId}:details`, restrictionTtl);

    await db.insert(userRestrictions).values({
      userId: event.userId,
      type: event.type,
      reason: event.reason,
      expiresAt: event.expiresAt,
      createdBy: event.restrictedBy,
    });
  }
}
