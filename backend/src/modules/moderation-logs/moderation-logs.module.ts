import { Module } from '@nestjs/common';
import { ModerationLogsController } from './moderation-logs.controller.js';
import { ModerationLogsService } from './services/moderation-logs.service.js';
import { MODERATION_LOGS_REPOSITORY } from './interfaces/moderation-logs-repository.interface.js';
import { ModerationLogsRepository } from './repositories/moderation-logs.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [ModerationLogsController],
  providers: [
    ModerationLogsService,
    {
      provide: MODERATION_LOGS_REPOSITORY,
      useClass: ModerationLogsRepository,
    },
  ],
  exports: [ModerationLogsService, MODERATION_LOGS_REPOSITORY],
})
export class ModerationLogsModule {}
