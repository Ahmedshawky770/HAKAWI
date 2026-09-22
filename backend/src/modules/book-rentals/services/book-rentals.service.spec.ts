import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookRentalsService } from './book-rentals.service.js';
import type { BookRentalsRepository } from '../repositories/book-rentals.repository.js';
import { RentalExtensionsService } from '../../rental-extensions/services/rental-extensions.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { RentalDuration } from '../interfaces/book-rentals-repository.interface.js';

type MockBookRentalsRepository = {
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findExpiredRentals: ReturnType<typeof vi.fn>;
};

type MockRentalExtensionsService = {
  create: ReturnType<typeof vi.fn>;
};

type MockEventEmitter2 = {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
};

const createMockBookRental = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'rental-123',
  bookId: 'book-123',
  renterId: 'user-123',
  rentalDuration: 'one_week',
  rentalPrice: 4.99,
  platformCommission: 0.5,
  ownerEarnings: 4.49,
  status: 'active',
  startDate: new Date(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  extensionCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('BookRentalsService', () => {
  let bookRentalsService: BookRentalsService;
  let bookRentalsRepository: MockBookRentalsRepository;
  let rentalExtensionsService: MockRentalExtensionsService;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    bookRentalsRepository = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findExpiredRentals: vi.fn(),
    };

    rentalExtensionsService = {
      create: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    bookRentalsService = new BookRentalsService(
      bookRentalsRepository as unknown as BookRentalsRepository,
      rentalExtensionsService as unknown as RentalExtensionsService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('rent', () => {
    it('should create rental and emit event', async () => {
      const rental = createMockBookRental();
      vi.mocked(bookRentalsRepository.create).mockResolvedValue(rental as any);

      const result = await bookRentalsService.rent(
        'book-123',
        'user-123',
        'one_week' as RentalDuration,
        4.99,
        0.5,
        4.49,
        new Date(),
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );

      expect(result).toEqual(rental);
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.rented', {
        bookId: 'book-123',
        renterId: 'user-123',
        rentalPeriod: 'one_week',
        expiresAt: expect.any(Date),
      });
    });
  });

  describe('extend', () => {
    it('should extend rental successfully', async () => {
      const rental = createMockBookRental({ renterId: 'user-123', status: 'active', extensionCount: 0 });
      const updatedRental = createMockBookRental({ extensionCount: 1, endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(rental as any);
      vi.mocked(rentalExtensionsService.create).mockResolvedValue({} as any);
      vi.mocked(bookRentalsRepository.update).mockResolvedValue(updatedRental as any);

      const result = await bookRentalsService.extend('rental-123', 'user-123', 7, 2.99);

      expect(result).toEqual(updatedRental);
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.rental_extended', {
        bookId: 'book-123',
        userId: 'user-123',
        newExpiresAt: expect.any(Date),
      });
    });

    it('should throw NotFoundException when rental not found', async () => {
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(null);

      await expect(bookRentalsService.extend('rental-123', 'user-123', 7, 2.99))
        .rejects.toThrow('Rental not found');
    });

    it('should throw BadRequestException when extending another users rental', async () => {
      const rental = createMockBookRental({ renterId: 'other-user' });
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(rental as any);

      await expect(bookRentalsService.extend('rental-123', 'user-123', 7, 2.99))
        .rejects.toThrow('You can only extend your own rentals');
    });

    it('should throw BadRequestException when rental is not active', async () => {
      const rental = createMockBookRental({ renterId: 'user-123', status: 'expired' });
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(rental as any);

      await expect(bookRentalsService.extend('rental-123', 'user-123', 7, 2.99))
        .rejects.toThrow('Only active rentals can be extended');
    });
  });

  describe('expireRental', () => {
    it('should expire rental when it exists and is active', async () => {
      const rental = createMockBookRental({ status: 'active' });
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(rental as any);
      vi.mocked(bookRentalsRepository.update).mockResolvedValue(undefined as any);

      await bookRentalsService.expireRental('rental-123');

      expect(bookRentalsRepository.update).toHaveBeenCalledWith('rental-123', { status: 'expired' });
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.rental_expired', {
        bookId: 'book-123',
        userId: 'user-123',
      });
    });

    it('should not throw when rental not found', async () => {
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(null);

      await expect(bookRentalsService.expireRental('rental-123')).resolves.toBeUndefined();
    });

    it('should not throw when rental is already expired', async () => {
      const rental = createMockBookRental({ status: 'expired' });
      vi.mocked(bookRentalsRepository.findById).mockResolvedValue(rental as any);

      await expect(bookRentalsService.expireRental('rental-123')).resolves.toBeUndefined();
      expect(bookRentalsRepository.update).not.toHaveBeenCalled();
    });
  });
});
