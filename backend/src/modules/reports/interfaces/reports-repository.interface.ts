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

export type ReportStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: string;
  reason: string;
  description: string;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReportData {
  reporterId: string;
  targetId: string;
  targetType: string;
  reason: string;
  description: string;
  status: ReportStatus;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  resolution?: string | null;
}

export interface UpdateReportData extends Partial<Pick<Report, 'status' | 'resolvedBy' | 'resolvedAt' | 'resolution'>> {}

export const REPORTS_REPOSITORY = 'REPORTS_REPOSITORY';
