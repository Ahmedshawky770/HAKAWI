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
  type ReportQueryInput,
} from './dto/report.dto.ts';

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

  async takeAction(reportId: string, adminId: string, dto: ModerationActionDto): Promise<ModerationAction> {
    const input = parseOrThrow(ModerationActionDto, dto);
    this.logger.info(`Admin ${adminId} taking action ${input.action} on report ${reportId}`, 'ModerationService');

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

    if (input.targetUserId && input.durationMinutes) {
      const expiresAt = new Date(Date.now() + input.durationMinutes * 60 * 1000);
      await db.insert(userRestrictions).values({
        userId: input.targetUserId,
        type: input.action === 'mute' ? 'mute' : input.action === 'ban' ? 'ban' : 'warning',
        reason: input.reason,
        expiresAt,
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
    });

    return action;
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
