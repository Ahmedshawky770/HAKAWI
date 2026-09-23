import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersEventHandler } from './users.event-handler.js';
import type { UsersRepository } from '../../../auth/repositories/users.repository.js';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.js';
import { UserRegisteredEvent, UserUpdatedEvent } from '../../../common/events/users.events.js';

type MockUsersRepository = Partial<UsersRepository>;
type MockWinstonLoggerService = Partial<WinstonLoggerService>;

const createMockUser = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  name: 'Test User',
  passwordHash: 'hashed',
  accountType: 'reader',
  adminRole: null,
  avatar: null,
  bio: null,
  googleId: null,
  facebookId: null,
  twitterId: null,
  githubId: null,
  appleId: null,
  tiktokId: null,
  isVerified: false,
  onboardingCompleted: false,
  accessBlocked: false,
  lastLoginAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UsersEventHandler', () => {
  let usersEventHandler: UsersEventHandler;
  let usersRepository: MockUsersRepository;
  let logger: MockWinstonLoggerService;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    logger = {
      info: vi.fn(),
    };

    usersEventHandler = new UsersEventHandler(
      usersRepository as unknown as UsersRepository,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('handleUserRegistered', () => {
    it('should update last login when user is found', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser());

      await usersEventHandler.handleUserRegistered(new UserRegisteredEvent('user-123', 'test@example.com', 'Test'));

      expect(usersRepository.update).toHaveBeenCalledWith('user-123', { lastLoginAt: expect.any(Date) });
    });

    it('should throw NotFoundException when user is not found', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(usersEventHandler.handleUserRegistered(new UserRegisteredEvent('missing-id', 'test@example.com', 'Test')))
        .rejects.toThrow('User not found');
    });
  });

  describe('handleUserUpdated', () => {
    it('should log updated event', async () => {
      await usersEventHandler.handleUserUpdated(new UserUpdatedEvent('user-123', { name: 'Updated' }));

      expect(logger.info).toHaveBeenCalledWith('Handling user updated event: user-123', 'UsersEventHandler');
    });
  });
});
