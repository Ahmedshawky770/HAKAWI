import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ModerationController } from './moderation.controller.js';
import { ReportsService } from './services/reports.service.js';
import { REPORTS_REPOSITORY } from './interfaces/reports-repository.interface.js';
import { ReportsRepository } from './repositories/reports.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [ReportsController, ModerationController],
  providers: [
    ReportsService,
    {
      provide: REPORTS_REPOSITORY,
      useClass: ReportsRepository,
    },
  ],
  exports: [ReportsService, REPORTS_REPOSITORY],
})
export class ReportsModule {}
