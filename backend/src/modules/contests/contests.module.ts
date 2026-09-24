import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CategoriesModule } from '../categories/categories.module.ts';

import { ContestsService } from './contests.service.ts';
import { ContestsController } from './controllers/contests.controller.ts';
import { ContestsRepository } from './repositories/contests.repository.ts';
import { ContestsEventHandler } from './events/contests.event-handler.ts';
import { CONTESTS_REPOSITORY } from './interfaces/contests-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule, CategoriesModule],
  controllers: [ContestsController],
  providers: [ContestsService, ContestsRepository, ContestsEventHandler, { provide: CONTESTS_REPOSITORY, useExisting: ContestsRepository }],
  exports: [ContestsService],
})
export class ContestsModule {}
