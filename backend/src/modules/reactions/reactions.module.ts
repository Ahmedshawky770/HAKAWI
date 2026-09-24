import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { ReactionsService } from './reactions.service.ts';
import { ReactionsController } from './controllers/reactions.controller.ts';
import { ReactionsRepository } from './repositories/reactions.repository.ts';
import { REACTIONS_REPOSITORY } from './interfaces/reactions-repository.interface.ts';
import { ReactionsEventHandler } from './events/reactions.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [ReactionsController],
  providers: [ReactionsService, ReactionsRepository, ReactionsEventHandler, { provide: REACTIONS_REPOSITORY, useExisting: ReactionsRepository }],
  exports: [ReactionsService],
})
export class ReactionsModule {}
