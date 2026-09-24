import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { LibraryItemAddedEvent, LibraryItemAccessedEvent, LibraryItemRemovedEvent } from '../../../common/events/library.events.ts';
import type { ILibraryRepository } from '../interfaces/library-repository.interface.ts';
import { LIBRARY_REPOSITORY } from '../interfaces/library-repository.interface.ts';

@Injectable()
export class LibraryEventHandler {
  constructor(
    @Inject(LIBRARY_REPOSITORY) private readonly libraryRepository: ILibraryRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('library.item.added')
  async handleLibraryItemAdded(event: LibraryItemAddedEvent): Promise<void> {
    this.logger.info(`Handling library item added event: ${event.libraryItemId}`, 'LibraryEventHandler');
  }

  @OnEvent('library.item.accessed')
  async handleLibraryItemAccessed(event: LibraryItemAccessedEvent): Promise<void> {
    this.logger.info(`Handling library item accessed event: ${event.libraryItemId}`, 'LibraryEventHandler');
  }

  @OnEvent('library.item.removed')
  async handleLibraryItemRemoved(event: LibraryItemRemovedEvent): Promise<void> {
    this.logger.info(`Handling library item removed event: ${event.libraryItemId}`, 'LibraryEventHandler');
  }
}
