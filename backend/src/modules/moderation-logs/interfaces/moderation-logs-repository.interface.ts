import { symbol } from '../../common/utils/symbol.util.js';
import type { ModerationLog } from '../../../db/schema/moderation-logs.schema.js';
import type { NewModerationLog } from '../../../db/schema/moderation-logs.schema.js';

export const MODERATION_LOGS_REPOSITORY = symbol('MODERATION_LOGS_REPOSITORY');

export type CreateModerationLogData = NewModerationLog;

export { ModerationLog };

export interface IModerationLogsRepository {
  findById(id: string): Promise<ModerationLog | null>;
  findByModeratorId(moderatorId: string): Promise<ModerationLog[]>;
  findByTargetId(targetId: string, targetType: string): Promise<ModerationLog[]>;
  findRecent(limit: number): Promise<ModerationLog[]>;
  create(data: CreateModerationLogData): Promise<ModerationLog>;
}
