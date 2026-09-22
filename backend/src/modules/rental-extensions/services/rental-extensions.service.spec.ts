import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RentalExtensionsService } from './rental-extensions.service.js';
import type { RentalExtensionsRepository } from '../repositories/rental-extensions.repository.js';
import { NotFoundException } from '@nestjs/common';

type MockRentalExtensionsRepository = Partial<RentalExtensionsRepository>;

const createMockRentalExtension = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'extension-123',
  rentalId: 'rental-123',
  userId: 'user-123',
  oldEndDate: new Date(),
  newEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  extensionPrice: 2.99,
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('RentalExtensionsService', () => {
  let rentalExtensionsService: RentalExtensionsService;
  let rentalExtensionsRepository: MockRentalExtensionsRepository;

  beforeEach(() => {
    rentalExtensionsRepository = {
      findById: vi.fn(),
      findByRentalId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
    };

    rentalExtensionsService = new RentalExtensionsService(
      rentalExtensionsRepository as RentalExtensionsRepository,
    );
  });

  describe('findById', () => {
    it('should return extension when found', async () => {
      const extension = createMockRentalExtension();
      vi.mocked(rentalExtensionsRepository.findById).mockResolvedValue(extension as any);

      const result = await rentalExtensionsService.findById('extension-123');

      expect(result).toEqual(extension);
    });

    it('should throw NotFoundException when extension not found', async () => {
      vi.mocked(rentalExtensionsRepository.findById).mockResolvedValue(null);

      await expect(rentalExtensionsService.findById('extension-123')).rejects.toThrow('Rental extension not found');
    });
  });

  describe('findByRentalId', () => {
    it('should return extensions by rental', async () => {
      const extensions = [createMockRentalExtension()];
      vi.mocked(rentalExtensionsRepository.findByRentalId).mockResolvedValue(extensions as any);

      const result = await rentalExtensionsService.findByRentalId('rental-123');

      expect(result).toEqual(extensions);
    });
  });

  describe('findByUserId', () => {
    it('should return extensions by user', async () => {
      const extensions = [createMockRentalExtension()];
      vi.mocked(rentalExtensionsRepository.findByUserId).mockResolvedValue(extensions as any);

      const result = await rentalExtensionsService.findByUserId('user-123');

      expect(result).toEqual(extensions);
    });
  });

  describe('create', () => {
    it('should create extension', async () => {
      const extension = createMockRentalExtension();
      vi.mocked(rentalExtensionsRepository.create).mockResolvedValue(extension as any);

      const result = await rentalExtensionsService.create({
        rentalId: 'rental-123',
        userId: 'user-123',
        oldEndDate: new Date(),
        newEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        extensionPrice: 2.99,
        currency: 'USD',
      } as any);

      expect(result).toEqual(extension);
    });
  });
});
