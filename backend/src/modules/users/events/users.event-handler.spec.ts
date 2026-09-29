import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import type { IUsersRepository, User, CreateUserInput, UpdateUserInput } from '../../../common/users/users-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { UserRegisteredEvent, UserUpdatedEvent } from '../../../common/events/users.events.ts';

import { UsersEventHandler } from './users.event-handler.ts';

type MockUsersRepository = {
  findById: Mock<(id: string) => Promise<User | null>>;
  findByEmail: Mock<(email: string) => Promise<User | null>>;
  findByUsername: Mock<(username: string) => Promise<User | null>>;
  findByGoogleId: Mock<(googleId: string) => Promise<User | null>>;
  findByFacebookId: Mock<(facebookId: string) => Promise<User | null>>;
  findByTwitterId: Mock<(twitterId: string) => Promise<User | null>>;
  findByGithubId: Mock<(githubId: string) => Promise<User | null>>;
  findByAppleId: Mock<(appleId: string) => Promise<User | null>>;
  findByTiktokId: Mock<(tiktokId: string) => Promise<User | null>>;
  create: Mock<(data: CreateUserInput) => Promise<User>>;
  update: Mock<(id: string, data: Partial<UpdateUserInput>) => Promise<User>>;
  softDelete: Mock<(id: string) => Promise<void>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
};

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
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      findByGoogleId: vi.fn(),
      findByFacebookId: vi.fn(),
      findByTwitterId: vi.fn(),
      findByGithubId: vi.fn(),
      findByAppleId: vi.fn(),
      findByTiktokId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };

    logger = {
      info: vi.fn(),
    };

    usersEventHandler = new UsersEventHandler(
      usersRepository,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('handleUserRegistered', () => {
    it('should update last login when user is found', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser() as unknown as User);

      await usersEventHandler.handleUserRegistered(new UserRegisteredEvent('user-123', 'test@example.com', 'Test'));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
