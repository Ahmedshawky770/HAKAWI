import { Module } from '@nestjs/common';
import { ModerationLogsService } from './services/moderation-logs.service.js';
import { ModerationLogsController } from './controllers/moderation-logs.controller.js';
import { ModerationLogsRepository } from './repositories/moderation-logs.repository.js';

@Module({
  imports: [],
  controllers: [ModerationLogsController],
  providers: [ModerationLogsService, ModerationLogsRepository],
  exports: [ModerationLogsService],
})
export class ModerationLogsModule {}
