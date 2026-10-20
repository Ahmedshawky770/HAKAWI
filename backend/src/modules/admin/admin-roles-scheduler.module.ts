import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AdminRolesService } from './services/admin-roles.service.ts';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [AdminRolesService],
  exports: [AdminRolesService],
})
export class AdminRolesSchedulerModule {}