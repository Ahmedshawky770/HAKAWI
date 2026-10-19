import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { PublishersService } from './services/publishers.service.ts';
import { PublishersController } from './controllers/publishers.controller.ts';
import { PublishersRepository } from './repositories/publishers.repository.ts';
import { PUBLISHERS_REPOSITORY } from './interfaces/publishers-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [PublishersController],
  providers: [
    PublishersService,
    PublishersRepository,
    { provide: PUBLISHERS_REPOSITORY, useExisting: PublishersRepository },
  ],
  exports: [PublishersService, PUBLISHERS_REPOSITORY],
})
export class PublishersModule {}