import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { TagsService } from './tags.service.ts';
import { TagsController } from './controllers/tags.controller.ts';
import { TagsRepository } from './repositories/tags.repository.ts';
import { TAGS_REPOSITORY } from './interfaces/tags-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [TagsController],
  providers: [TagsService, TagsRepository, { provide: TAGS_REPOSITORY, useExisting: TagsRepository }],
  exports: [TagsService],
})
export class TagsModule {}
