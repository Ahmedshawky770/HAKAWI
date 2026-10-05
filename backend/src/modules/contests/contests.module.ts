import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CategoriesModule } from '../categories/categories.module.ts';
import { NotificationsModule } from '../notifications/notifications.module.ts';
import { SharedCacheModule } from '../shared/cache/shared-cache.module.ts';

import { ContestsService } from './contests.service.ts';
import { ContestsController } from './controllers/contests.controller.ts';
import { ContestsRepository } from './repositories/contests.repository.ts';
import { ContestsEventHandler } from './events/contests.event-handler.ts';
import { CONTESTS_REPOSITORY } from './interfaces/contests-repository.interface.ts';

@Module({
  // `NotificationsModule` is imported because `ContestsEventHandler` writes through
  // `NotificationsService` — the only path that consults the recipient's preferences and emits
  // `notification.created`, so a contest notification written any other way bypasses both.
  //
  // This file imported `NotificationsModule` but never listed it here, so the import was dead and
  // Nest could not resolve the handler's second constructor argument:
  //   "Nest can't resolve dependencies of the ContestsEventHandler
  //    (Symbol(CONTESTS_REPOSITORY), ?, WinstonLoggerService)"
  // Like the books/library cycle, that aborts the whole module graph before any test body runs, so
  // the entire DB-backed suite skipped and stayed green. The handler is the consumer; this is where
  // its dependency has to be declared (Principle #7).
  imports: [CommonModule, DatabaseModule, SharedCacheModule, CategoriesModule, NotificationsModule],
  controllers: [ContestsController],
  providers: [
    ContestsService,
    ContestsRepository,
    ContestsEventHandler,
    { provide: CONTESTS_REPOSITORY, useExisting: ContestsRepository },
  ],
  exports: [ContestsService],
})
export class ContestsModule {}
