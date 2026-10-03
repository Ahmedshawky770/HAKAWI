import { isOneOf } from './common.js';
import type { NamedPage } from './common.js';

export const REPORT_TARGET_TYPES = ['story', 'comment', 'user'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const isReportTargetType = (value: string): value is ReportTargetType => isOneOf(REPORT_TARGET_TYPES, value);

export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const isReportStatus = (value: string): value is ReportStatus => isOneOf(REPORT_STATUSES, value);

export const MODERATION_ACTIONS = ['warn', 'mute', 'ban', 'content_removal', 'no_action'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const isModerationAction = (value: string): value is ModerationAction => isOneOf(MODERATION_ACTIONS, value);

export const REPORT_SOURCES = ['user', 'auto'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const isReportSource = (value: string): value is ReportSource => isOneOf(REPORT_SOURCES, value);

export type Report = {
  id: string;
  reporterId: string | null;
  targetId: string;
  targetType: ReportTargetType;
  reason: string;
  description: string | null;
  status: ReportStatus;
  source: ReportSource;
  escalatedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportsListResponse = NamedPage<'reports', Report>;

export type ModerationActionRecord = {
  id: string;
  reportId: string | null;
  adminId: string;
  action: ModerationAction;
  reason: string;
  durationMinutes: number | null;
  targetUserId: string | null;
  createdAt: string;
};
