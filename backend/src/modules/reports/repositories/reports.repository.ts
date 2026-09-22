import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { reports } from '../../../db/schema/reports.schema.js';
import { db } from '../../../db/index.js';
import type {
  IReportsRepository,
  Report,
  CreateReportData,
  UpdateReportData,
  ReportStatus,
} from '../interfaces/reports-repository.interface.js';

@Injectable()
export class ReportsRepository implements IReportsRepository {
  private readonly logger = new Logger(ReportsRepository.name);

  private castReport = (report: Record<string, unknown>): Report => report as unknown as Report;

  async findById(id: string): Promise<Report | null> {
    this.logger.debug(`Finding report by id: ${id}`);
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);
    return report ? this.castReport(report) : null;
  }

  async findByReporterId(reporterId: string): Promise<Report[]> {
    this.logger.debug(`Finding reports by reporter: ${reporterId}`);
    const reportsList = await db
      .select()
      .from(reports)
      .where(eq(reports.reporterId, reporterId))
      .orderBy(desc(reports.createdAt));
    return reportsList.map(report => this.castReport(report));
  }

  async findByTargetId(
    targetId: string,
    targetType: string,
  ): Promise<Report[]> {
    this.logger.debug(`Finding reports by target: ${targetId} / ${targetType}`);
    const reportsList = await db
      .select()
      .from(reports)
      .where(
        and(eq(reports.targetId, targetId), eq(reports.targetType, targetType)),
      )
      .orderBy(desc(reports.createdAt));
    return reportsList.map(report => this.castReport(report));
  }

  async findByStatus(status: ReportStatus): Promise<Report[]> {
    this.logger.debug(`Finding reports by status: ${status}`);
    const reportsList = await db
      .select()
      .from(reports)
      .where(eq(reports.status, status))
      .orderBy(desc(reports.createdAt));
    return reportsList.map(report => this.castReport(report));
  }

  async findOpenReports(): Promise<Report[]> {
    this.logger.debug('Finding open reports');
    const reportsList = await db
      .select()
      .from(reports)
      .where(eq(reports.status, 'open'))
      .orderBy(asc(reports.createdAt));
    return reportsList.map(report => this.castReport(report));
  }

  async create(data: CreateReportData): Promise<Report> {
    this.logger.log(`Creating report by user: ${data.reporterId}`);
    const [report] = await db.insert(reports).values(data).returning();
    return this.castReport(report);
  }

  async update(id: string, data: Partial<UpdateReportData>): Promise<Report> {
    this.logger.debug(`Updating report: ${id}`);
    const [report] = await db
      .update(reports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return this.castReport(report);
  }

  async countByTarget(targetId: string, targetType: string): Promise<number> {
    this.logger.debug(
      `Counting reports by target: ${targetId} / ${targetType}`,
    );
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(reports)
      .where(
        and(eq(reports.targetId, targetId), eq(reports.targetType, targetType)),
      );
    return Number(count);
  }
}
