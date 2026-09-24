export type Report = {
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
};

export type CreateReportDto = {
  targetId: string;
  targetType: 'story' | 'comment' | 'user';
  reason: string;
  description?: string;
};

export type UpdateReportStatusDto = {
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
};

export type ModerationActionDto = {
  action: 'warn' | 'mute' | 'ban' | 'content_removal' | 'no_action';
  reason: string;
  durationMinutes?: number;
  targetUserId?: string;
};

export type ModerationAction = {
  id: string;
  reportId: string | null;
  adminId: string;
  action: string;
  reason: string;
  durationMinutes: number | null;
  targetUserId: string | null;
  createdAt: Date;
};

export type UserRestriction = {
  id: string;
  userId: string;
  type: string;
  reason: string;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
};

export type AdminDashboardStats = {
  totalReports: number;
  openReports: number;
  escalatedReports: number;
  inReviewReports: number;
  resolvedReports: number;
  dismissedReports: number;
  totalActions: number;
  totalRestrictions: number;
  activeRestrictions: number;
  avgResolutionMinutes: number | null;
};
