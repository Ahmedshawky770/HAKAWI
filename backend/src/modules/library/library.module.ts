import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { LibraryService } from './library.service.ts';
import { LibraryController } from './controllers/library.controller.ts';
import { LibraryRepository } from './repositories/library.repository.ts';
import { LIBRARY_REPOSITORY } from './interfaces/library-repository.interface.ts';
import { LibraryEventHandler } from './events/library.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [LibraryController],
  providers: [LibraryService, LibraryRepository, LibraryEventHandler, { provide: LIBRARY_REPOSITORY, useExisting: LibraryRepository }],
  exports: [LibraryService],
})
export class LibraryModule {}
