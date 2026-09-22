import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IBookSalesRepository, CreateBookSaleData } from '../interfaces/book-sales-repository.interface.js';
import { BOOK_SALES_REPOSITORY } from '../interfaces/book-sales-repository.interface.js';
import { BookSalesRepository } from '../repositories/book-sales.repository.js';

@Injectable()
export class BookSalesService {
  private readonly logger = new Logger(BookSalesService.name);

  constructor(
    @Inject(BOOK_SALES_REPOSITORY) private readonly bookSalesRepository: BookSalesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async purchase(bookId: string, buyerId: string, sellerId: string, salePrice: number, currency: string, saleType: string, transactionId?: string): Promise<CreateBookSaleData> {
    this.logger.log(`Processing book purchase: ${bookId} by ${buyerId}`);

    const sale = await this.bookSalesRepository.create({
      bookId,
      buyerId,
      sellerId,
      salePrice,
      currency,
      saleType,
    });

    this.eventEmitter.emit('book.purchased', { bookId, buyerId, price: salePrice, transactionId });
    return sale;
  }
}
