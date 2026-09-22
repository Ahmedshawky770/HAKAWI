export interface IModerationLogsRepository {
  findById(id: string): Promise<ModerationLog | null>;
  findByModeratorId(moderatorId: string): Promise<ModerationLog[]>;
  findByTargetId(targetId: string, targetType: string): Promise<ModerationLog[]>;
  findRecent(limit: number): Promise<ModerationLog[]>;
  create(data: CreateModerationLogData): Promise<ModerationLog>;
}

export type ModerationAction = 'dismiss' | 'warn' | 'restrict' | 'ban' | 'remove_content' | 'escalate';

export interface ModerationLog {
  id: string;
  moderatorId: string;
  action: ModerationAction;
  targetId: string;
  targetType: string;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateModerationLogData {
  moderatorId: string;
  action: ModerationAction;
  targetId: string;
  targetType: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
}

export const MODERATION_LOGS_REPOSITORY = 'MODERATION_LOGS_REPOSITORY';
