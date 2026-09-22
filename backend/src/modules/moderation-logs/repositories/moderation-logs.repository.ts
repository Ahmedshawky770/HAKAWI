import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { moderationLogs } from '../../../db/schema/moderation-logs.schema.js';
import { db } from '../../../db/index.js';
import type {
  IModerationLogsRepository,
  ModerationLog,
  CreateModerationLogData,
} from '../interfaces/moderation-logs-repository.interface.js';

@Injectable()
export class ModerationLogsRepository implements IModerationLogsRepository {
  private readonly logger = new Logger(ModerationLogsRepository.name);

  private castModerationLog = (log: Record<string, unknown>): ModerationLog => log as unknown as ModerationLog;

  async findById(id: string): Promise<ModerationLog | null> {
    this.logger.debug(`Finding moderation log by id: ${id}`);
    const [log] = await db
      .select()
      .from(moderationLogs)
      .where(eq(moderationLogs.id, id))
      .limit(1);
    return log ? this.castModerationLog(log) : null;
  }

  async findByModeratorId(moderatorId: string): Promise<ModerationLog[]> {
    this.logger.debug(`Finding moderation logs by moderator: ${moderatorId}`);
    const logs = await db
      .select()
      .from(moderationLogs)
      .where(eq(moderationLogs.moderatorId, moderatorId))
      .orderBy(desc(moderationLogs.createdAt));
    return logs.map(log => this.castModerationLog(log));
  }

  async findByTargetId(
    targetId: string,
    targetType: string,
  ): Promise<ModerationLog[]> {
    this.logger.debug(
      `Finding moderation logs by target: ${targetId} / ${targetType}`,
    );
    const logs = await db
      .select()
      .from(moderationLogs)
      .where(
        and(
          eq(moderationLogs.targetId, targetId),
          eq(moderationLogs.targetType, targetType),
        ),
      )
      .orderBy(desc(moderationLogs.createdAt));
    return logs.map(log => this.castModerationLog(log));
  }

  async findRecent(limit: number): Promise<ModerationLog[]> {
    this.logger.debug(`Finding recent moderation logs: ${limit}`);
    const logs = await db
      .select()
      .from(moderationLogs)
      .orderBy(desc(moderationLogs.createdAt))
      .limit(limit);
    return logs.map(log => this.castModerationLog(log));
  }

  async create(data: CreateModerationLogData): Promise<ModerationLog> {
    this.logger.log(
      `Creating moderation log by moderator: ${data.moderatorId}`,
    );
    const [log] = await db.insert(moderationLogs).values(data).returning();
    return this.castModerationLog(log);
  }
}
