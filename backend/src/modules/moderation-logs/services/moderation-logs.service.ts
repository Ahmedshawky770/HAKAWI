import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IModerationLogsRepository, CreateModerationLogData } from '../interfaces/moderation-logs-repository.interface.js';
import { MODERATION_LOGS_REPOSITORY } from '../interfaces/moderation-logs-repository.interface.js';
import { ModerationLogsRepository } from '../repositories/moderation-logs.repository.js';

@Injectable()
export class ModerationLogsService {
  private readonly logger = new Logger(ModerationLogsService.name);

  constructor(
    @Inject(MODERATION_LOGS_REPOSITORY) private readonly logsRepository: ModerationLogsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreateModerationLogData> {
    const log = await this.logsRepository.findById(id);
    if (!log) {
      throw new NotFoundException('Moderation log not found');
    }
    return log;
  }

  async findByModeratorId(moderatorId: string): Promise<CreateModerationLogData[]> {
    return this.logsRepository.findByModeratorId(moderatorId);
  }

  async findByTargetId(targetId: string, targetType: string): Promise<CreateModerationLogData[]> {
    return this.logsRepository.findByTargetId(targetId, targetType);
  }

  async findRecent(limit: number): Promise<CreateModerationLogData[]> {
    return this.logsRepository.findRecent(limit);
  }

  async create(data: CreateModerationLogData): Promise<CreateModerationLogData> {
    const log = await this.logsRepository.create(data);
    this.eventEmitter.emit('content.moderation_action', { reportId: '', moderatorId: data.moderatorId, action: data.action, targetId: data.targetId, targetType: data.targetType, reason: data.reason });
    return log;
  }
}
