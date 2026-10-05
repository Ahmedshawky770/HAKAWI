import { forwardRef, Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { PaymentsModule } from '../payments/payments.module.ts';
import { LibraryModule } from '../library/library.module.ts';
import { RentalsModule } from '../rentals/rentals.module.ts';

import { BooksRepository } from './repositories/books.repository.ts';
import { BOOKS_REPOSITORY } from './interfaces/books-repository.interface.ts';
import { BooksService } from './books.service.ts';
import { BooksController } from './controllers/books.controller.ts';
import { BooksEventHandler } from './events/books.event-handler.ts';

@Module({
  // `LibraryModule` is wrapped in `forwardRef` because the two modules genuinely need each other and
  // the cycle is NOT removable by deleting an import. Books asks the library "does this reader already
  // own this book?" before it initialises a payment, and the library asks the books table whether a
  // claimed book is `is_free` — each through the other module's own repository token (Principle #7),
  // so neither reads the other's table. Without `forwardRef` on BOTH sides, one of the two classes
  // evaluates to `undefined` at import time and Nest aborts the whole graph with
  // "The module at index [3] of the LibraryModule \"imports\" array is undefined".
  //
  // WHY THIS WAS NOT CAUGHT: the failure happens in `DependenciesScanner.scanForModules`, i.e. before
  // any test body runs, so every integration spec skipped rather than failed and the suite stayed
  // green. It also stops the backend from booting at all — only the frontend container came up. A
  // circular dependency here is a launch blocker, not a style issue.
  imports: [
    CommonModule,
    DatabaseModule,
    PaymentsModule,
    RentalsModule,
    forwardRef(() => LibraryModule),
  ],
  controllers: [BooksController],
  providers: [
    BooksService,
    BooksRepository,
    BooksEventHandler,
    { provide: BOOKS_REPOSITORY, useExisting: BooksRepository },
  ],
  // `BOOKS_REPOSITORY` is exported so the library module can verify `is_free` when a reader
  // claims a free book, through this module's own interface (Principle #7). `CommentsModule` and
  // `LibraryModule` already export their repository tokens for the same reason.
  exports: [BooksService, BOOKS_REPOSITORY],
})
export class BooksModule {}
