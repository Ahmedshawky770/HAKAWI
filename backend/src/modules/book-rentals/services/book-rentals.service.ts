import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IBookRentalsRepository, CreateBookRentalData, RentalDuration } from '../interfaces/book-rentals-repository.interface.js';
import { BOOK_RENTALS_REPOSITORY } from '../interfaces/book-rentals-repository.interface.js';
import { BookRentalsRepository } from '../repositories/book-rentals.repository.js';
import { RentalExtensionsService } from '../../rental-extensions/services/rental-extensions.service.js';

@Injectable()
export class BookRentalsService {
  private readonly logger = new Logger(BookRentalsService.name);

  constructor(
    @Inject(BOOK_RENTALS_REPOSITORY) private readonly bookRentalsRepository: BookRentalsRepository,
    private readonly rentalExtensionsService: RentalExtensionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async rent(bookId: string, renterId: string, rentalDuration: RentalDuration, rentalPrice: number, platformCommission: number, ownerEarnings: number, startDate: Date, endDate: Date): Promise<CreateBookRentalData> {
    this.logger.info(`Processing book rental: ${bookId} by ${renterId}`);

    const rental = await this.bookRentalsRepository.create({
      bookId,
      renterId,
      rentalDuration,
      rentalPrice,
      platformCommission,
      ownerEarnings,
      extensionCount: 0,
      status: 'active',
      startDate,
      endDate,
    });

    this.eventEmitter.emit('book.rented', { bookId, renterId, rentalPeriod: rentalDuration, expiresAt: endDate });
    return rental;
  }

  async extend(rentalId: string, userId: string, extensionDays: number, extensionPrice: number): Promise<CreateBookRentalData> {
    const rental = await this.bookRentalsRepository.findById(rentalId);
    if (!rental) {
      throw new NotFoundException('Rental not found');
    }
    if (rental.renterId !== userId) {
      throw new BadRequestException('You can only extend your own rentals');
    }
    if (rental.status !== 'active') {
      throw new BadRequestException('Only active rentals can be extended');
    }

    const oldEndDate = rental.endDate!;
    const newEndDate = new Date(oldEndDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);

    await this.rentalExtensionsService.create({
      rentalId,
      userId,
      oldEndDate,
      newEndDate,
      extensionPrice,
    });

    const updated = await this.bookRentalsRepository.update(rentalId, {
      endDate: newEndDate,
      extensionCount: rental.extensionCount + 1,
    });

    this.eventEmitter.emit('book.rental_extended', { bookId: rental.bookId, userId, newExpiresAt: newEndDate });
    return updated;
  }

  async expireRental(rentalId: string): Promise<void> {
    const rental = await this.bookRentalsRepository.findById(rentalId);
    if (!rental || rental.status !== 'active') {
      return;
    }
    await this.bookRentalsRepository.update(rentalId, { status: 'expired' });
    this.eventEmitter.emit('book.rental_expired', { bookId: rental.bookId, userId: rental.renterId });
  }
}
