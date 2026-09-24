import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { sql, eq, and, gt, or, desc, count, lt, isNull } from 'drizzle-orm';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { reports, moderationActions, userRestrictions } from '../../db/schema/moderation.schema.ts';
import { db } from '../../db/index.ts';

import type { AdminDashboardStatsDto } from './dto/admin-dashboard.dto.ts';

type TrendRecord = {
  total: number;
  open: number;
  escalated: number;
  in_review: number;
  resolved: number;
  dismissed: number;
};

@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async getStats(): Promise<AdminDashboardStatsDto> {
    const [
      totalReportsRow,
      openReportsRow,
      escalatedReportsRow,
      inReviewReportsRow,
      resolvedReportsRow,
      dismissedReportsRow,
      totalActionsRow,
      totalRestrictionsRow,
      activeRestrictionsRow,
    ] = await Promise.all([
      db.select({ count: count() }).from(reports),
      db.select({ count: count() }).from(reports).where(eq(reports.status, 'open')),
      db.select({ count: count() }).from(reports).where(eq(reports.status, 'escalated')),
      db.select({ count: count() }).from(reports).where(eq(reports.status, 'in_review')),
      db.select({ count: count() }).from(reports).where(eq(reports.status, 'resolved')),
      db.select({ count: count() }).from(reports).where(eq(reports.status, 'dismissed')),
      db.select({ count: count() }).from(moderationActions),
      db.select({ count: count() }).from(userRestrictions),
      db.select({ count: count() }).from(userRestrictions).where(or(isNull(userRestrictions.expiresAt), gt(userRestrictions.expiresAt, new Date()))),
    ]);

    return {
      totalReports: Number(totalReportsRow[0]?.count || 0),
      openReports: Number(openReportsRow[0]?.count || 0),
      escalatedReports: Number(escalatedReportsRow[0]?.count || 0),
      inReviewReports: Number(inReviewReportsRow[0]?.count || 0),
      resolvedReports: Number(resolvedReportsRow[0]?.count || 0),
      dismissedReports: Number(dismissedReportsRow[0]?.count || 0),
      totalActions: Number(totalActionsRow[0]?.count || 0),
      totalRestrictions: Number(totalRestrictionsRow[0]?.count || 0),
      activeRestrictions: Number(activeRestrictionsRow[0]?.count || 0),
      avgResolutionMinutes: this.calculateAvgResolutionTime(),
    };
  }

  async getReportTrends(days: number): Promise<Record<string, TrendRecord>> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentReports = await db
      .select({
        date: reports.createdAt,
        status: reports.status,
      })
      .from(reports)
      .where(gt(reports.createdAt, cutoffDate));

    const trends: Record<string, TrendRecord> = {};

    recentReports.forEach((report) => {
      const dateKey = new Date(report.date).toISOString().split('T')[0];
      if (!trends[dateKey]) {
        trends[dateKey] = { total: 0, open: 0, escalated: 0, in_review: 0, resolved: 0, dismissed: 0 };
      }
      trends[dateKey].total++;
      const status = report.status;
      if (status in trends[dateKey]) {
        trends[dateKey][status as keyof TrendRecord]++;
      }
    });

    return trends;
  }

  async getUserRestrictions(userId: string, includeExpired: boolean): Promise<unknown> {
    if (!userId) {
      return { restrictions: [] };
    }

    const conditions = [eq(userRestrictions.userId, userId)];

    if (!includeExpired) {
      const orCondition = or(isNull(userRestrictions.expiresAt), gt(userRestrictions.expiresAt, new Date()));
      if (orCondition) {
        conditions.push(orCondition);
      }
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0] as ReturnType<typeof eq>;

    const userRests = await db
      .select()
      .from(userRestrictions)
      .where(whereClause as ReturnType<typeof eq>)
      .orderBy(desc(userRestrictions.createdAt));

    return {
      restrictions: userRests,
    };
  }

  async getModerationActions(query: { page: number; limit: number; adminId?: string; action?: string }): Promise<unknown> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (query.adminId) {
      conditions.push(eq(moderationActions.adminId, query.adminId));
    }

    if (query.action) {
      conditions.push(eq(moderationActions.action, query.action));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [actionsResult, [{ total }]] = await Promise.all([
      db.select().from(moderationActions).where(whereClause).orderBy(desc(moderationActions.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(moderationActions).where(whereClause),
    ]);

    return {
      actions: actionsResult,
      total: Number(total),
      page,
      limit,
    };
  }

  private calculateAvgResolutionTime(): number | null {
    return null;
  }

  async autoEscalateReports(): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const openReports = await db
      .select()
      .from(reports)
      .where(and(eq(reports.status, 'open'), lt(reports.createdAt, twentyFourHoursAgo)));

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
        this.logger.warn(`Auto-escalated report ${report.id} for target ${report.targetId}`, 'AdminDashboardService');
      }
    }

    if (escalatedCount > 0) {
      this.logger.info(`Auto-escalated ${escalatedCount} reports`, 'AdminDashboardService');
    }

    return escalatedCount;
  }
}
