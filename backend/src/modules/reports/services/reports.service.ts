import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IReportsRepository, CreateReportData, UpdateReportData, ReportStatus } from '../interfaces/reports-repository.interface.js';
import { REPORTS_REPOSITORY } from '../interfaces/reports-repository.interface.js';
import { ReportsRepository } from '../repositories/reports.repository.js';

export type { ReportStatus, UpdateReportData } from '../interfaces/reports-repository.interface.js';

export const REPORT_STATUS = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const;

export type ReportStatusType = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const MODERATION_ACTION = {
  DISMISS: 'dismiss',
  WARN: 'warn',
  RESTRICT: 'restrict',
  BAN: 'ban',
  REMOVE_CONTENT: 'remove_content',
  ESCALATE: 'escalate',
} as const;

export type ModerationAction = (typeof MODERATION_ACTION)[keyof typeof MODERATION_ACTION];

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(REPORTS_REPOSITORY) private readonly reportsRepository: ReportsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreateReportData> {
    const report = await this.reportsRepository.findById(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  async findByReporterId(reporterId: string): Promise<CreateReportData[]> {
    return this.reportsRepository.findByReporterId(reporterId);
  }

  async findByTargetId(targetId: string, targetType: string): Promise<CreateReportData[]> {
    return this.reportsRepository.findByTargetId(targetId, targetType);
  }

  async findByStatus(status: ReportStatus): Promise<CreateReportData[]> {
    return this.reportsRepository.findByStatus(status);
  }

  async findOpenReports(): Promise<CreateReportData[]> {
    return this.reportsRepository.findOpenReports();
  }

  async create(reporterId: string, data: Omit<CreateReportData, 'reporterId' | 'status'>): Promise<CreateReportData> {
    if (reporterId === data.targetId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const existing = await this.reportsRepository.findByTargetId(data.targetId, data.targetType);
    if (existing.some(r => r.reporterId === reporterId)) {
      throw new ConflictException('You have already reported this content');
    }

    const report = await this.reportsRepository.create({ ...data, reporterId, status: REPORT_STATUS.OPEN });
    this.eventEmitter.emit('content.reported', { reportId: report.id, reporterId, targetId: data.targetId, targetType: data.targetType, reason: data.reason });
    return report;
  }

  async update(id: string, data: Partial<UpdateReportData>): Promise<CreateReportData> {
    return this.reportsRepository.update(id, data);
  }

  async countByTarget(targetId: string, targetType: string): Promise<number> {
    return this.reportsRepository.countByTarget(targetId, targetType);
  }
}
