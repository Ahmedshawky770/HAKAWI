import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRestrictionsService } from './user-restrictions.service.js';
import type { UserRestrictionsRepository } from '../repositories/user-restrictions.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';

type MockUserRestrictionsRepository = Partial<UserRestrictionsRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockUserRestriction = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'restriction-123',
  userId: 'user-123',
  restrictionType: 'temporary_ban',
  reason: 'Violation of terms',
  expiresAt: new Date(Date.now() + 86400000),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UserRestrictionsService', () => {
  let userRestrictionsService: UserRestrictionsService;
  let userRestrictionsRepository: MockUserRestrictionsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    userRestrictionsRepository = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findActiveByUserId: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteExpired: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    userRestrictionsService = new UserRestrictionsService(
      userRestrictionsRepository as UserRestrictionsRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return restriction when found', async () => {
      const restriction = createMockUserRestriction();
      vi.mocked(userRestrictionsRepository.findById).mockResolvedValue(restriction as any);

      const result = await userRestrictionsService.findById('restriction-123');

      expect(result).toEqual(restriction);
    });

    it('should throw NotFoundException when restriction not found', async () => {
      vi.mocked(userRestrictionsRepository.findById).mockResolvedValue(null);

      await expect(userRestrictionsService.findById('restriction-123')).rejects.toThrow('User restriction not found');
    });
  });

  describe('findByUserId', () => {
    it('should return restrictions by user', async () => {
      const restrictions = [createMockUserRestriction()];
      vi.mocked(userRestrictionsRepository.findByUserId).mockResolvedValue(restrictions as any);

      const result = await userRestrictionsService.findByUserId('user-123');

      expect(result).toEqual(restrictions);
    });
  });

  describe('findActiveByUserId', () => {
    it('should return active restriction by user', async () => {
      const restriction = createMockUserRestriction();
      vi.mocked(userRestrictionsRepository.findActiveByUserId).mockResolvedValue(restriction as any);

      const result = await userRestrictionsService.findActiveByUserId('user-123');

      expect(result).toEqual(restriction);
    });
  });

  describe('create', () => {
    it('should create restriction and emit event', async () => {
      const restriction = createMockUserRestriction();
      vi.mocked(userRestrictionsRepository.create).mockResolvedValue(restriction as any);

      const result = await userRestrictionsService.create({
        userId: 'user-123',
        restrictionType: 'temporary_ban',
        reason: 'Violation of terms',
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      } as any);

      expect(result).toEqual(restriction);
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.restricted', {
        userId: 'user-123',
        restrictionType: 'temporary_ban',
        duration: expect.any(Date),
        reason: 'Violation of terms',
      });
    });
  });

  describe('delete', () => {
    it('should delete restriction and emit event', async () => {
      vi.mocked(userRestrictionsRepository.delete).mockResolvedValue(undefined as any);

      await userRestrictionsService.delete('restriction-123');

      expect(userRestrictionsRepository.delete).toHaveBeenCalledWith('restriction-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.unrestricted', {
        userId: '',
        reason: 'Restriction removed',
      });
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired restrictions', async () => {
      vi.mocked(userRestrictionsRepository.deleteExpired).mockResolvedValue(5);

      const result = await userRestrictionsService.deleteExpired();

      expect(result).toBe(5);
    });
  });
});
