import { symbol } from '../../common/utils/symbol.util.js';
import type { Report } from '../../../db/schema/reports.schema.js';
import type { NewReport } from '../../../db/schema/reports.schema.js';

export const REPORTS_REPOSITORY = symbol('REPORTS_REPOSITORY');

export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export type CreateReportData = NewReport;
export type UpdateReportData = Partial<CreateReportData>;

export { Report };

export interface IReportsRepository {
  findById(id: string): Promise<Report | null>;
  findByReporterId(reporterId: string): Promise<Report[]>;
  findByTargetId(targetId: string, targetType: string): Promise<Report[]>;
  findByStatus(status: ReportStatus): Promise<Report[]>;
  findOpenReports(): Promise<Report[]>;
  create(data: CreateReportData): Promise<Report>;
  update(id: string, data: Partial<UpdateReportData>): Promise<Report>;
  countByTarget(targetId: string, targetType: string): Promise<number>;
}
