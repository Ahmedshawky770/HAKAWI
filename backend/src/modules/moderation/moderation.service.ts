import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { eq, desc, count, and, sql } from 'drizzle-orm';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { reports, moderationActions, userRestrictions, type ReportSource } from '../../db/schema/moderation.schema.ts';
import { db } from '../../db/index.ts';
import { parseOrThrow } from '../shared/validation/zod-validation.util.ts';

import {
  CreateReportDto,
  ModerationActionDto,
  ReportQueryDto,
  UpdateReportStatusDto,
  CONTENT_BEARING_TARGET_TYPES,
  type ReportQueryInput,
} from './dto/report.dto.ts';
import { restrictionTtlSeconds, restrictionTypeForAction } from './restriction-policy.ts';

export interface Report {
  id: string;
  reporterId: string | null;
  targetId: string;
  targetType: string;
  reason: string;
  description: string | null;
  status: string;
  source: ReportSource;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationAction {
  id: string;
  reportId: string | null;
  adminId: string;
  action: string;
  reason: string;
  durationMinutes: number | null;
  targetUserId: string | null;
  createdAt: Date;
}

export interface UserRestriction {
  id: string;
  userId: string;
  type: string;
  reason: string;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export const AUTO_ESCALATION_REPORT_THRESHOLD = 3;

export const AUTO_ESCALATION_WINDOW_MS = 60 * 60 * 1000;

/**
 * The shape `reports.id` has, as the database spells it (`uuid` primary key).
 *
 * WHY THE ID IS CHECKED BEFORE IT IS QUERIED. `takeAction` inserts into `moderation_actions`,
 * whose `report_id` is a foreign key onto `reports(id)`. A report id that does not exist — or that
 * is not a UUID at all — used to reach that constraint and come back as a driver error, which
 * `AllExceptionsFilter` turns into an opaque 500. The caller asked about something that is not
 * there, so the honest answer is a 404, and a 404 is also the answer that does not confirm or deny
 * anything about which ids exist.
 *
 * WHY THE CHECK IS HERE AND NOT ONLY IN A PIPE. The route takes the id as a plain parameter, and
 * the service is the layer that owns the read; guarding it here means the service cannot be
 * misused by a future internal caller that hands it an unvalidated string.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

@Injectable()
export class ModerationService {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto): Promise<Report> {
    const input = parseOrThrow(CreateReportDto, dto);
    this.logger.info(`Creating report by ${reporterId} for ${input.targetType} ${input.targetId}`, 'ModerationService');

    const [report] = await db
      .insert(reports)
      .values({
        reporterId,
        targetId: input.targetId,
        targetType: input.targetType,
        reason: input.reason,
        description: input.description || null,
        status: 'open',
      })
      .returning();

    await this.eventBus.emit('moderation.report.created', {
      reportId: report.id,
      reporterId,
      targetId: input.targetId,
      targetType: input.targetType,
      reason: input.reason,
    });

    await this.checkAutoEscalation(input.targetId);

    return report;
  }

  async findAllReports(
    query: ReportQueryInput,
  ): Promise<{ reports: Report[]; total: number; page: number; limit: number }> {
    const parsed: ReportQueryDto = parseOrThrow(ReportQueryDto, query);
    const page = parsed.page;
    const limit = parsed.limit;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (parsed.status) conditions.push(eq(reports.status, parsed.status));
    if (parsed.targetType) conditions.push(eq(reports.targetType, parsed.targetType));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [reportsResult, [{ total }]] = await Promise.all([
      db.select().from(reports).where(whereClause).orderBy(desc(reports.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(reports).where(whereClause),
    ]);

    return { reports: reportsResult, total: Number(total), page, limit };
  }

  async updateReportStatus(id: string, dto: UpdateReportStatusDto): Promise<Report> {
    const input = parseOrThrow(UpdateReportStatusDto, dto);

    const [existing] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existing) {
      throw new NotFoundException('Report not found');
    }

    const [report] = await db
      .update(reports)
      .set({
        status: input.status,
        resolvedAt: input.status === 'resolved' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  /**
   * THE REPORT IS LOADED FIRST, AND THAT IS THE WHOLE FIX FOR TWO DEFECTS.
   *
   * 1. **A `content_removal` that removed nothing.** The action used to end at
   *    `moderation.action.taken`, so the audit trail recorded "remove this content" and nothing
   *    anywhere deleted or hid it — the story or comment stayed live for every reader, and because
   *    the delete routes are `JwtAuthGuard + OwnershipGuard` a moderator had no HTTP path to take
   *    it down either. The report's `targetType` and `targetId` are exactly what a removal needs,
   *    and they were never read.
   * 2. **A 500 for a report that is not there.** `moderation_actions.report_id` is a foreign key, so
   *    an unknown or malformed id used to reach Postgres and surface through the generic filter as
   *    an opaque 500. Reading the report first answers both with a 404.
   *
   * WHY THE MODERATION MODULE DOES NOT DELETE THE CONTENT ITSELF. `stories` and `comments` are
   * owned by their own modules, and their delete paths do more than a `DELETE`: a soft delete that
   * keeps the row readable for its author, a `decrementReplyCount` on a comment's parent, a
   * `decrementCommentCount` on the story, invalidation of the exact cache keys that hold the changed
   * row, and the `story.deleted` / `comment.deleted` events their consumers already act on (the
   * Sanity mirror, the story counters). Reimplementing any part of that from here would be a second
   * and divergent copy of one module's business rules — the "two writers, one fact" shape this
   * codebase has already been burned by (Principle #7, #9). The decision therefore travels over the
   * event bus as `moderation.content.removed` and each owning module applies it through its own
   * service.
   *
   * WHY THE EVENT IS EMITTED AFTER THE AUDIT ROW AND NOT BEFORE. The decision is durable before its
   * effect is requested: an admin reading `moderation_actions` must never see a removal that was
   * applied but never recorded. The removal itself is asynchronous and eventual (Principle #14) —
   * the admin's response is not blocked on the delete, so a slow or failing consumer cannot fail an
   * action that was already correctly recorded.
   */
  async takeAction(reportId: string, adminId: string, dto: ModerationActionDto): Promise<ModerationAction> {
    const input = parseOrThrow(ModerationActionDto, dto);
    this.logger.info(`Admin ${adminId} taking action ${input.action} on report ${reportId}`, 'ModerationService');

    const [report] = isUuid(reportId)
      ? await db.select().from(reports).where(eq(reports.id, reportId)).limit(1)
      : [];
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const [action] = await db
      .insert(moderationActions)
      .values({
        reportId,
        adminId,
        targetUserId: input.targetUserId || null,
        action: input.action,
        reason: input.reason,
        durationMinutes: input.durationMinutes || null,
      })
      .returning();

    // Normalised once, because the DTO leaves an absent duration as `undefined` and every reader
    // below means "no duration was supplied".
    const durationMinutes = input.durationMinutes ?? null;

    // WHY THIS GATE IS NOT `targetUserId && durationMinutes` ANY MORE. It was, and it meant a `ban`
    // or a `mute` recorded with a target user but no duration was enforced from the
    // `restriction:<userId>` cache key — `ModerationEventHandler` applies the policy default TTL —
    // while leaving no `user_restrictions` row at all: `GET /moderation/users/:id/restrictions`
    // reported nothing, and when the cache key expired there was no durable record that the
    // restriction had ever been enforced. A duration-less account restriction is a policy default,
    // not a missing restriction. Non-restricting actions (`warn`, `content_removal`, `no_action`)
    // still record an audit row only when a duration was supplied, which is what they always did.
    const restrictsTheAccount = input.action === 'ban' || input.action === 'mute';
    if (input.targetUserId && (durationMinutes !== null || restrictsTheAccount)) {
      // The expiry comes from the shared policy rather than from the duration alone, so the row and
      // the enforcement cache that `ModerationEventHandler` writes from this same action can no
      // longer disagree about how long the restriction lasts.
      const ttlSeconds = restrictionTtlSeconds(input.action, durationMinutes);
      await db.insert(userRestrictions).values({
        userId: input.targetUserId,
        type: restrictionTypeForAction(input.action),
        reason: input.reason,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        createdBy: adminId,
      });
    }

    await this.eventBus.emit('moderation.action.taken', {
      actionId: action.id,
      reportId,
      adminId,
      targetUserId: input.targetUserId || '',
      action: input.action,
      reason: input.reason,
      durationMinutes,
    });

    await this.requestContentRemoval(report, adminId, input.reason, input.action);

    return action;
  }

  /**
   * ASKS THE OWNING MODULE TO REMOVE THE REPORTED CONTENT — and only for a `content_removal`.
   *
   * WHY THE ACTION IS RE-CHECKED HERE. `content_removal` is the one action whose effect is not an
   * account restriction, so it is the only one that needs this second event. A `warn`, a `mute`, a
   * `ban` and a `no_action` are all already fully handled by `moderation.action.taken` and the
   * shared restriction policy; emitting a removal for any of them would delete content nobody
   * decided to delete.
   *
   * WHY THE TARGET TYPE IS TESTED AGAINST `CONTENT_BEARING_TARGET_TYPES` RATHER THAN EMITTED
   * UNCONDITIONALLY. A report on a `user` target has no content to remove — the account-level
   * actions are `ban` and `mute`, which already exist and already enforce through the restriction
   * cache. Emitting an event with no consumer would park a dead letter and log a validation failure
   * for a decision that was correctly carried out. An unknown target type is logged the same way:
   * the action is still recorded in `moderation_actions`, and the log states plainly that nothing
   * was removed and why, so the operator is never told a removal happened when it did not.
   */
  private async requestContentRemoval(report: Report, adminId: string, reason: string, action: string): Promise<void> {
    if (action !== 'content_removal') {
      return;
    }

    if (!CONTENT_BEARING_TARGET_TYPES.includes(report.targetType as (typeof CONTENT_BEARING_TARGET_TYPES)[number])) {
      this.logger.info(
        `Content removal requested on report ${report.id}, but a ${report.targetType} target has no content to remove; ` +
          'the account-level actions are ban and mute',
        'ModerationService',
      );
      return;
    }

    this.logger.info(
      `Requesting removal of ${report.targetType} ${report.targetId} reported by report ${report.id}`,
      'ModerationService',
    );

    await this.eventBus.emit('moderation.content.removed', {
      reportId: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      adminId,
      reason,
    });
  }

  /**
   * Escalates every open report against a target once it has collected enough of them.
   *
   * The rows are read before the write so the emitted event can carry the status and
   * `updated_at` they genuinely held. The previous version updated every report for the target
   * regardless of status and emitted a single event carrying the *new* timestamp, which made
   * the audit trail claim a transition that may not have happened and left per-report
   * consumers blind to all but one of the reports.
   */
  async checkAutoEscalation(targetId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ total }] = await db
      .select({ total: count() })
      .from(reports)
      .where(and(eq(reports.targetId, targetId), sql`${reports.createdAt} > ${oneHourAgo}`));

    if (Number(total) < AUTO_ESCALATION_REPORT_THRESHOLD) {
      return;
    }

    const pending = await db
      .select({ id: reports.id, status: reports.status, updatedAt: reports.updatedAt })
      .from(reports)
      .where(and(eq(reports.targetId, targetId), eq(reports.status, 'open')))
      .orderBy(reports.createdAt);

    if (pending.length > 0) {
      const now = new Date();
      const escalated = await db
        .update(reports)
        .set({ escalatedAt: now, status: 'in_review', updatedAt: now })
        .where(and(eq(reports.targetId, targetId), eq(reports.status, 'open')))
        .returning({ id: reports.id });

      const escalatedIds = new Set(escalated.map((row) => row.id));
      for (const report of pending) {
        if (!escalatedIds.has(report.id)) {
          continue;
        }
        await this.eventBus.emit('moderation.report.escalated', {
          reportId: report.id,
          targetId,
          previousStatus: report.status,
          previousUpdatedAt: report.updatedAt,
        });
      }
    }

    this.logger.warn(`Auto-escalated ${total} reports for target ${targetId}`, 'ModerationService');
  }

  async autoEscalateReports(): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const openReports = await db
      .select()
      .from(reports)
      .where(and(eq(reports.status, 'open'), sql`${reports.createdAt} < ${twentyFourHoursAgo}`));

    let escalatedCount = 0;

    for (const report of openReports) {
      // Compare-and-set: the SELECT above is a separate statement, so the status is
      // re-asserted here. A report an admin resolved in the gap is not resurrected.
      const [updated] = await db
        .update(reports)
        .set({
          status: 'escalated',
          escalatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(reports.id, report.id), eq(reports.status, 'open')))
        .returning();

      if (updated) {
        escalatedCount++;
        await this.eventBus.emit('moderation.report.escalated', {
          reportId: report.id,
          targetId: report.targetId,
          previousStatus: report.status,
          previousUpdatedAt: report.updatedAt,
        });
        this.logger.warn(`Auto-escalated report ${report.id} for target ${report.targetId}`, 'ModerationService');
      }
    }

    if (escalatedCount > 0) {
      this.logger.info(`Auto-escalated ${escalatedCount} reports`, 'ModerationService');
    }

    return escalatedCount;
  }
}
