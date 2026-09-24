import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count, and, sql, or, gt, isNull } from 'drizzle-orm';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { reports, moderationActions, userRestrictions } from '../../db/schema/moderation.schema.ts';
import { db } from '../../db/index.ts';
import { AdminRole } from '../../common/constants/roles.ts';

import type { CreateReportDto, UpdateReportStatusDto, ModerationActionDto, ReportQueryDto } from './dto/report.dto.ts';
import type { AdminDashboardStatsDto } from './dto/admin-dashboard.dto.ts';


export interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: string;
  reason: string;
  description: string | null;
  status: string;
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

@Injectable()
export class ModerationService {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto): Promise<Report> {
    this.logger.info(`Creating report by ${reporterId} for ${dto.targetType} ${dto.targetId}`, 'ModerationService');

    const [report] = await db.insert(reports).values({
      reporterId,
      targetId: dto.targetId,
      targetType: dto.targetType,
      reason: dto.reason,
      description: dto.description || null,
      status: 'open',
    }).returning();

    return report;
  }

  async findAllReports(query: ReportQueryDto): Promise<{ reports: Report[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.status) conditions.push(eq(reports.status, query.status));
    if (query.targetType) conditions.push(eq(reports.targetType, query.targetType));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [reportsResult, [{ total }]] = await Promise.all([
      db.select().from(reports).where(whereClause).orderBy(desc(reports.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(reports).where(whereClause),
    ]);

    return { reports: reportsResult, total: Number(total) };
  }

  async updateReportStatus(id: string, dto: UpdateReportStatusDto): Promise<Report> {
    const [report] = await db.update(reports).set({
      status: dto.status,
      resolvedAt: dto.status === 'resolved' ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(reports.id, id)).returning();
    return report;
  }

  async takeAction(reportId: string, adminId: string, dto: ModerationActionDto): Promise<ModerationAction> {
    this.logger.info(`Admin ${adminId} taking action ${dto.action} on report ${reportId}`, 'ModerationService');

    const [action] = await db.insert(moderationActions).values({
      reportId,
      adminId,
      targetUserId: dto.targetUserId || null,
      action: dto.action,
      reason: dto.reason,
      durationMinutes: dto.durationMinutes || null,
    }).returning();

    if (dto.targetUserId && dto.durationMinutes) {
      const expiresAt = new Date(Date.now() + dto.durationMinutes * 60 * 1000);
      await db.insert(userRestrictions).values({
        userId: dto.targetUserId,
        type: dto.action === 'mute' ? 'mute' : dto.action === 'ban' ? 'ban' : 'warning',
        reason: dto.reason,
        expiresAt,
        createdBy: adminId,
      });
    }

    await this.eventBus.emit('moderation.action.taken', {
      actionId: action.id,
      reportId,
      adminId,
      targetUserId: dto.targetUserId || '',
      action: dto.action,
      reason: dto.reason,
    });

    return action;
  }

  async checkAutoEscalation(reportId: string, targetId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ total }] = await db.select({ total: count() }).from(reports).where(
      and(eq(reports.targetId, targetId), sql`${reports.createdAt} > ${oneHourAgo}`)
    );

    if (Number(total) >= 3) {
      await db.update(reports).set({ escalatedAt: new Date(), status: 'in_review', updatedAt: new Date() }).where(eq(reports.targetId, targetId));
      this.logger.warn(`Auto-escalated ${total} reports for target ${targetId}`, 'ModerationService');
      await this.eventBus.emit('moderation.report.escalated', { targetId, reportCount: Number(total) });
    }
  }

  async autoEscalateReports(): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const openReports = await db
      .select()
      .from(reports)
      .where(and(eq(reports.status, 'open'), sql`${reports.createdAt} < ${twentyFourHoursAgo}`));

    let escalatedCount = 0;

    for (const report of openReports) {
      const [updated] = await db
        .update(reports)
        .set({
          status: 'escalated',
          escalatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reports.id, report.id))
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
