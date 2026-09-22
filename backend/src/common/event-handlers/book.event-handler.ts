import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

@Injectable()
export class BookEventHandler {
  private readonly logger: Logger;

  constructor(
    private readonly valkeyService: ValkeyService,
    private readonly winstonLogger: WinstonLoggerService,
  ) {
    this.logger = new Logger(BookEventHandler.name);
  }

  @OnEvent('book.created')
  async handleBookCreated(event: { bookId: string; authorId: string; title: string; price: number }): Promise<void> {
    this.winstonLogger.log(`Book created: ${event.bookId} by ${event.authorId}`, 'BookEventHandler');
    await this.valkeyService.del('books:stats');
  }

  @OnEvent('book.purchased')
  async handleBookPurchased(event: { bookId: string; buyerId: string; price: number; transactionId?: string }): Promise<void> {
    this.winstonLogger.log(`Book purchased: ${event.bookId} by ${event.buyerId}`, 'BookEventHandler');
  }

  @OnEvent('book.rented')
  async handleBookRented(event: { bookId: string; renterId: string; rentalPeriod: string; expiresAt: Date }): Promise<void> {
    this.winstonLogger.log(`Book rented: ${event.bookId} by ${event.renterId} until ${event.expiresAt}`, 'BookEventHandler');
  }

  @OnEvent('book.rental_extended')
  async handleBookRentalExtended(event: { bookId: string; userId: string; newExpiresAt: Date }): Promise<void> {
    this.winstonLogger.log(`Rental extended: ${event.bookId} for ${event.userId}`, 'BookEventHandler');
  }

  @OnEvent('book.rental_expired')
  async handleBookRentalExpired(event: { bookId: string; userId: string }): Promise<void> {
    this.winstonLogger.log(`Rental expired: ${event.bookId} for ${event.userId}`, 'BookEventHandler');
  }

  @OnEvent('book.reviewed')
  async handleBookReviewed(event: { bookId: string; userId: string; rating: number }): Promise<void> {
    this.winstonLogger.log(`Book reviewed: ${event.bookId} rated ${event.rating} by ${event.userId}`, 'BookEventHandler');
    await this.valkeyService.del(`book:${event.bookId}:rating`);
  }
}
