import { describe, it, expect, beforeEach, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { RentalsService } from './rentals.service.ts';
import type { IRentalsRepository } from './interfaces/rentals-repository.interface.ts';
import type { Rental, CreateRentalInput, RentalExtension } from './types.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockRentalsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Rental | null>>>;
  findByUserAndBook: ReturnType<typeof vi.fn<(userId: string, bookId: string) => Promise<Rental | null>>>;
  findActiveByUser: ReturnType<typeof vi.fn<(userId: string) => Promise<Rental[]>>>;
  findAll: ReturnType<typeof vi.fn<(params: { userId?: string; status?: string; page?: number; limit?: number }) => Promise<{ rentals: Rental[]; total: number }>>>;
  create: ReturnType<typeof vi.fn<(data: CreateRentalInput) => Promise<Rental>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<Rental>) => Promise<Rental>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  createExtension: ReturnType<typeof vi.fn<(data: { rentalId: string; previousEndDate: Date; newEndDate: Date; extensionDays: number }) => Promise<RentalExtension>>>;
  findExtensionsByRental: ReturnType<typeof vi.fn<(rentalId: string) => Promise<RentalExtension[]>>>;
  findOverdue: ReturnType<typeof vi.fn<() => Promise<Rental[]>>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

describe('RentalsService', () => {
  let rentalsService: RentalsService;
  let rentalsRepository: MockRentalsRepository;
  let logger: MockWinstonLoggerService;
  let valkeyService: MockValkeyService;
  let eventValidatorService: MockEventValidatorService;

  const mockRental: Rental = {
    id: 'rental-123',
    userId: 'user-123',
    bookId: 'book-123',
    status: 'active',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-15'),
    extendedCount: 0,
    maxExtensions: 2,
    returnedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    rentalsRepository = {
      findById: vi.fn<(id: string) => Promise<Rental | null>>(),
      findByUserAndBook: vi.fn<(userId: string, bookId: string) => Promise<Rental | null>>(),
      findActiveByUser: vi.fn<(userId: string) => Promise<Rental[]>>(),
      findAll: vi.fn<(params: { userId?: string; status?: string; page?: number; limit?: number }) => Promise<{ rentals: Rental[]; total: number }>>(),
      create: vi.fn<(data: CreateRentalInput) => Promise<Rental>>(),
      update: vi.fn<(id: string, data: Partial<Rental>) => Promise<Rental>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      createExtension: vi.fn<(data: { rentalId: string; previousEndDate: Date; newEndDate: Date; extensionDays: number }) => Promise<RentalExtension>>(),
      findExtensionsByRental: vi.fn<(rentalId: string) => Promise<RentalExtension[]>>(),
      findOverdue: vi.fn<() => Promise<Rental[]>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    valkeyService = {
      exists: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    rentalsService = new RentalsService(
      rentalsRepository,
      logger as unknown as WinstonLoggerService,
      valkeyService as unknown as ValkeyService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('createRental', () => {
    it('should create a rental successfully', async () => {
      const createInput: CreateRentalInput = {
        userId: 'user-123',
        bookId: 'book-123',
        durationDays: 14,
      };

      vi.mocked(rentalsRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(rentalsRepository.create).mockResolvedValue({
        ...mockRental,
        ...createInput,
        id: 'rental-456',
      });

      const result = await rentalsService.createRental('user-123', createInput);

      expect(result).toHaveProperty('id', 'rental-456');
      expect(result.status).toBe('active');
      expect(rentalsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          bookId: 'book-123',
          durationDays: 14,
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.created', expect.any(Object));
    });

    it('should throw ConflictException when user already has an active rental', async () => {
      const createInput: CreateRentalInput = {
        userId: 'user-123',
        bookId: 'book-123',
        durationDays: 7,
      };

      vi.mocked(rentalsRepository.findByUserAndBook).mockResolvedValue(mockRental);

      await expect(rentalsService.createRental('user-123', createInput)).rejects.toThrow('You already have an active rental for this book');
    });
  });

  describe('findById', () => {
    it('should return a rental by id', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await rentalsService.findById('rental-123', 'user-123');

      expect(result).toEqual(mockRental);
      expect(rentalsRepository.findById).toHaveBeenCalledWith('rental-123');
    });

    it('should throw NotFoundException when rental not found', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(null);

      await expect(rentalsService.findById('rental-999', 'user-123')).rejects.toThrow('Rental not found');
    });
  });

  describe('extendRental', () => {
    it('should extend a rental successfully', async () => {
      const activeRental = { ...mockRental, extendedCount: 0, maxExtensions: 2 };
      const newEndDate = new Date('2024-01-29');
      const extension: RentalExtension = {
        id: 'ext-123',
        rentalId: 'rental-123',
        previousEndDate: new Date('2024-01-15'),
        newEndDate,
        extensionDays: 14,
        createdAt: new Date(),
      };

      vi.mocked(rentalsRepository.findById).mockResolvedValue(activeRental);
      vi.mocked(rentalsRepository.createExtension).mockResolvedValue(extension);
      vi.mocked(rentalsRepository.update).mockResolvedValue({ ...activeRental, endDate: newEndDate, extendedCount: 1 });

      const result = await rentalsService.extendRental('rental-123', 14, 'user-123');

      expect(result).toEqual(extension);
      expect(rentalsRepository.createExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          rentalId: 'rental-123',
          extensionDays: 14,
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.extended', expect.any(Object));
    });

    it('should throw ForbiddenException when rental is not active', async () => {
      const returnedRental = { ...mockRental, status: 'returned' as const };
      vi.mocked(rentalsRepository.findById).mockResolvedValue(returnedRental);

      await expect(rentalsService.extendRental('rental-123', 14, 'user-123')).rejects.toThrow('Cannot extend a non-active rental');
    });

    it('should throw ForbiddenException when max extensions reached', async () => {
      const maxExtensionsRental = { ...mockRental, extendedCount: 2, maxExtensions: 2 };
      vi.mocked(rentalsRepository.findById).mockResolvedValue(maxExtensionsRental);

      await expect(rentalsService.extendRental('rental-123', 14, 'user-123')).rejects.toThrow('Maximum extensions reached for this rental');
    });
  });

  describe('returnRental', () => {
    it('should return a rental successfully', async () => {
      vi.mocked(rentalsRepository.findById).mockResolvedValue(mockRental);
      vi.mocked(rentalsRepository.update).mockResolvedValue({ ...mockRental, status: 'returned', returnedAt: new Date() });

      const result = await rentalsService.returnRental('rental-123', 'user-123');

      expect(result.status).toBe('returned');
      expect(result.returnedAt).not.toBeNull();
      expect(rentalsRepository.update).toHaveBeenCalledWith(
        'rental-123',
        expect.objectContaining({ status: 'returned', returnedAt: expect.any(Date) }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.returned', expect.any(Object));
    });

    it('should throw ForbiddenException when rental already returned', async () => {
      const returnedRental = { ...mockRental, status: 'returned' as const };
      vi.mocked(rentalsRepository.findById).mockResolvedValue(returnedRental);

      await expect(rentalsService.returnRental('rental-123', 'user-123')).rejects.toThrow('Rental has already been returned');
    });
  });

  describe('findOverdue', () => {
    it('should return overdue rentals', async () => {
      const overdueRentals = [mockRental];
      vi.mocked(rentalsRepository.findOverdue).mockResolvedValue(overdueRentals);

      const result = await rentalsService.findOverdue();

      expect(result).toHaveLength(1);
      expect(rentalsRepository.findOverdue).toHaveBeenCalled();
    });
  });

  describe('checkAndExpireOverdue', () => {
    it('should expire overdue rentals', async () => {
      const overdueRentals = [mockRental];
      vi.mocked(rentalsRepository.findOverdue).mockResolvedValue(overdueRentals);
      vi.mocked(rentalsRepository.update).mockResolvedValue({ ...mockRental, status: 'expired' });

      await rentalsService.checkAndExpireOverdue();

      expect(rentalsRepository.findOverdue).toHaveBeenCalled();
      expect(rentalsRepository.update).toHaveBeenCalledWith('rental-123', { status: 'expired' });
      expect(eventValidatorService.emit).toHaveBeenCalledWith('rental.expired', expect.any(Object));
    });
  });
});
