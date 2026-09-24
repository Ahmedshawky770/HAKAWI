import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { BookCreatedEvent, BookUpdatedEvent, BookPublishedEvent, BookArchivedEvent, BookDeletedEvent } from '../../../common/events/books.events.ts';
import type { IBooksRepository } from '../interfaces/books-repository.interface.ts';
import { BOOKS_REPOSITORY } from '../interfaces/books-repository.interface.ts';

@Injectable()
export class BooksEventHandler {
  constructor(
    @Inject(BOOKS_REPOSITORY) private readonly booksRepository: IBooksRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('book.created')
  async handleBookCreated(event: BookCreatedEvent): Promise<void> {
    this.logger.info(`Handling book created event: ${event.bookId}`, 'BooksEventHandler');
  }

  @OnEvent('book.updated')
  async handleBookUpdated(event: BookUpdatedEvent): Promise<void> {
    this.logger.info(`Handling book updated event: ${event.bookId}`, 'BooksEventHandler');
  }

  @OnEvent('book.published')
  async handleBookPublished(event: BookPublishedEvent): Promise<void> {
    this.logger.info(`Handling book published event: ${event.bookId}`, 'BooksEventHandler');
  }

  @OnEvent('book.archived')
  async handleBookArchived(event: BookArchivedEvent): Promise<void> {
    this.logger.info(`Handling book archived event: ${event.bookId}`, 'BooksEventHandler');
  }

  @OnEvent('book.deleted')
  async handleBookDeleted(event: BookDeletedEvent): Promise<void> {
    this.logger.info(`Handling book deleted event: ${event.bookId}`, 'BooksEventHandler');
  }
}
