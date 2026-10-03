import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { PaymentsModule } from '../payments/payments.module.ts';
import { BooksModule } from '../books/books.module.ts';

import { LibraryService } from './library.service.ts';
import { LibraryController } from './controllers/library.controller.ts';
import { LibraryRepository } from './repositories/library.repository.ts';
import { LIBRARY_REPOSITORY } from './interfaces/library-repository.interface.ts';
import { LibraryEventHandler } from './events/library.event-handler.ts';

@Module({
  // PaymentsModule is imported so `LibraryEventHandler` can read the completed payment it grants an
  // entitlement FOR. That is the dependency's whole reason to exist: without it there is no path from
  // "the gateway confirmed the payment" to "the user owns the book", which is the defect this wiring
  // closes. The read goes through `IPaymentsRepository`, and the library never writes a payment.
  imports: [CommonModule, DatabaseModule, PaymentsModule, BooksModule],
  controllers: [LibraryController],
  providers: [
    LibraryService,
    LibraryRepository,
    LibraryEventHandler,
    { provide: LIBRARY_REPOSITORY, useExisting: LibraryRepository },
  ],
  // Exported so the books module can ask "does this user already own this book?" through this
  // module's OWN interface, rather than reading the library table itself (Principle #7). Books needs
  // the answer before it initialises a payment, and a duplicate purchase is a direct money loss.
  // `CommentsModule` already exports `COMMENTS_REPOSITORY` for the same reason.
  exports: [LibraryService, LIBRARY_REPOSITORY],
})
export class LibraryModule {}
