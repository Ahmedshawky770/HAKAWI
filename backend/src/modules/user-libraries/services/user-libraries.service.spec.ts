import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserLibrariesService } from './user-libraries.service.js';
import type { UserLibrariesRepository } from '../repositories/user-libraries.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException } from '@nestjs/common';

type MockUserLibrariesRepository = Partial<UserLibrariesRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockUserLibrary = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'library-123',
  userId: 'user-123',
  bookId: 'book-123',
  accessType: 'purchase',
  purchasedAt: new Date(),
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UserLibrariesService', () => {
  let userLibrariesService: UserLibrariesService;
  let userLibrariesRepository: MockUserLibrariesRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    userLibrariesRepository = {
      findByUserId: vi.fn(),
      findByUserAndBook: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    userLibrariesService = new UserLibrariesService(
      userLibrariesRepository as UserLibrariesRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findByUserId', () => {
    it('should return library items by user', async () => {
      const items = [createMockUserLibrary()];
      vi.mocked(userLibrariesRepository.findByUserId).mockResolvedValue(items as any);

      const result = await userLibrariesService.findByUserId('user-123');

      expect(result).toEqual(items);
    });
  });

  describe('create', () => {
    it('should create library entry and emit event', async () => {
      const entry = createMockUserLibrary();
      vi.mocked(userLibrariesRepository.findByUserAndBook).mockResolvedValue(null);
      vi.mocked(userLibrariesRepository.create).mockResolvedValue(entry as any);

      const result = await userLibrariesService.create('user-123', 'book-123', 'purchase');

      expect(result).toEqual(entry);
      expect(eventEmitter.emit).toHaveBeenCalledWith('book.added_to_library', {
        userId: 'user-123',
        bookId: 'book-123',
        accessType: 'purchase',
      });
    });

    it('should throw ConflictException when book already in library', async () => {
      vi.mocked(userLibrariesRepository.findByUserAndBook).mockResolvedValue(createMockUserLibrary() as any);

      await expect(userLibrariesService.create('user-123', 'book-123', 'purchase'))
        .rejects.toThrow('Book already in library');
    });
  });

  describe('delete', () => {
    it('should delete library entry', async () => {
      const entry = createMockUserLibrary();
      vi.mocked(userLibrariesRepository.findByUserAndBook).mockResolvedValue(entry as any);
      vi.mocked(userLibrariesRepository.delete).mockResolvedValue(undefined as any);

      await userLibrariesService.delete('user-123', 'book-123');

      expect(userLibrariesRepository.delete).toHaveBeenCalledWith('library-123');
    });

    it('should throw NotFoundException when book not in library', async () => {
      vi.mocked(userLibrariesRepository.findByUserAndBook).mockResolvedValue(null);

      await expect(userLibrariesService.delete('user-123', 'book-123'))
        .rejects.toThrow('Book not found in library');
    });
  });
});
