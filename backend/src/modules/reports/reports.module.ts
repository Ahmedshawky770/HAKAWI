import { Module } from '@nestjs/common';
import { ReportsService } from './services/reports.service.js';
import { ReportsController } from './controllers/reports.controller.js';
import { ReportsRepository } from './repositories/reports.repository.js';

@Module({
  imports: [],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
