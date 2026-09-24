import { Module } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { FollowsService } from './follows.service.ts';
import { FollowsController } from './controllers/follows.controller.ts';
import { FollowsRepository } from './repositories/follows.repository.ts';
import { FOLLOWS_REPOSITORY } from './interfaces/follows-repository.interface.ts';
import { FollowsEventHandler } from './events/follows.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [FollowsController],
  providers: [FollowsService, FollowsRepository, FollowsEventHandler, { provide: FOLLOWS_REPOSITORY, useExisting: FollowsRepository }],
  exports: [FollowsService],
})
export class FollowsModule {}
