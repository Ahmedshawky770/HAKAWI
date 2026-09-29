import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import type { User, CreateUserInput, UpdateUserInput } from '../../common/users/users-repository.interface.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { PasswordHasher } from '../../common/utils/password.util.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';


import { UsersService } from './users.service.ts';

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
  getUserStats: Mock<(id: string) => Promise<{ storiesCount: number; totalViews: number; totalReactions: number; followersCount: number; followingCount: number }>>;
};

type MockPasswordHasher = {
  hash: ReturnType<typeof vi.fn>;
  compare: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment */

const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  googleId: null,
  facebookId: null,
  twitterId: null,
  githubId: null,
  appleId: null,
  tiktokId: null,
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  name: 'Test User',
  avatar: null,
  bio: null,
  accountType: AccountType.READER,
  adminRole: null,
  isVerified: false,
  onboardingCompleted: false,
  accessBlocked: false,
  lastLoginAt: null,
  deletedAt: null,
  emailVerified: false,
  emailVerificationToken: null,
  passwordResetToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UsersService', () => {
  let usersService: UsersService;
  let usersRepository: MockUsersRepository;
  let passwordHasher: MockPasswordHasher;
  let valkeyService: MockValkeyService;
  let winstonLoggerService: MockWinstonLoggerService;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>(),
      findByEmail: vi.fn<(email: string) => Promise<User | null>>(),
      findByUsername: vi.fn<(username: string) => Promise<User | null>>(),
      findByGoogleId: vi.fn<(googleId: string) => Promise<User | null>>(),
      findByFacebookId: vi.fn<(facebookId: string) => Promise<User | null>>(),
      findByTwitterId: vi.fn<(twitterId: string) => Promise<User | null>>(),
      findByGithubId: vi.fn<(githubId: string) => Promise<User | null>>(),
      findByAppleId: vi.fn<(appleId: string) => Promise<User | null>>(),
      findByTiktokId: vi.fn<(tiktokId: string) => Promise<User | null>>(),
      create: vi.fn<(data: CreateUserInput) => Promise<User>>(),
      update: vi.fn<(id: string, data: Partial<UpdateUserInput>) => Promise<User>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      getUserStats: vi.fn<(id: string) => Promise<{ storiesCount: number; totalViews: number; totalReactions: number; followersCount: number; followingCount: number }>>(),
    };

    passwordHasher = {
      hash: vi.fn(),
      compare: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
    };

    winstonLoggerService = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    usersService = new UsersService(
      usersRepository,
      passwordHasher as unknown as PasswordHasher,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
    );
  });

  describe('findById', () => {
    it('should return user from cache when available', async () => {
      const cachedUser = { id: 'user-123', username: 'testuser', email: 'test@example.com' };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedUser));

      const result = await usersService.findById('user-123');

      expect(result).toEqual(cachedUser);
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('should fetch from repository and cache when not in cache', async () => {
      const user = createMockUser();
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(user);

      const result = await usersService.findById('user-123');

      expect(result.id).toBe('user-123');
      expect(valkeyService.set).toHaveBeenCalledWith(
        'user:user-123',
        expect.any(String),
        300,
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(usersService.findById('user-123')).rejects.toThrow('User not found');
    });

    it('should throw NotFoundException when user is soft deleted', async () => {
      const deletedUser = createMockUser({ deletedAt: new Date() });
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(deletedUser);

      await expect(usersService.findById('user-123')).rejects.toThrow('User not found');
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);

      const result = await usersService.findByEmail('test@example.com');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when email not found', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

      await expect(usersService.findByEmail('test@example.com')).rejects.toThrow('User not found');
    });
  });

  describe('findByUsername', () => {
    it('should return user by username', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(user);

      const result = await usersService.findByUsername('testuser');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when username not found', async () => {
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);

      await expect(usersService.findByUsername('testuser')).rejects.toThrow('User not found');
    });
  });

  describe('create', () => {
    it('should create user successfully', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'newuser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(passwordHasher.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersRepository.create).mockResolvedValue(createMockUser({ email: input.email, username: input.username }));

      const result = await usersService.create(input);

      expect(result.email).toBe(input.email);
      expect(passwordHasher.hash).toHaveBeenCalledWith('SecurePass123!');
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          username: input.username,
          passwordHash: 'hashed-password',
          accountType: AccountType.READER,
        }),
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const input: CreateUserInput = {
        email: 'existing@example.com',
        username: 'newuser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());

      await expect(usersService.create(input)).rejects.toThrow('Email already exists');
    });

    it('should throw ConflictException when username already exists', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'existinguser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(createMockUser());

      await expect(usersService.create(input)).rejects.toThrow('Username already exists');
    });

    it('should hash password when provided', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'newuser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(passwordHasher.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersRepository.create).mockResolvedValue(createMockUser());

      await usersService.create(input);

      expect(passwordHasher.hash).toHaveBeenCalledWith('SecurePass123!');
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      const input: UpdateUserInput = { name: 'Updated Name' };
      const updatedUser = createMockUser({ name: 'Updated Name' });

      vi.mocked(usersRepository.update).mockResolvedValue(updatedUser);

      const result = await usersService.update('user-123', input);

      expect(result.name).toBe('Updated Name');
      expect(valkeyService.del).toHaveBeenCalledWith('user:user-123');
    });

    it('should throw ConflictException when updating to existing email', async () => {
      const input: UpdateUserInput = { email: 'existing@example.com' };
      const otherUser = createMockUser({ id: 'other-user', email: 'existing@example.com' });

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(otherUser);

      await expect(usersService.update('user-123', input)).rejects.toThrow('Email already exists');
    });

    it('should allow updating own email', async () => {
      const input: UpdateUserInput = { email: 'test@example.com' };
      const updatedUser = createMockUser({ email: 'test@example.com' });

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser({ id: 'user-123' }));
      vi.mocked(usersRepository.update).mockResolvedValue(updatedUser);

      const result = await usersService.update('user-123', input);

      expect(result.email).toBe('test@example.com');
    });
  });

  describe('softDelete', () => {
    it('should soft delete user and clear cache', async () => {
      vi.mocked(usersRepository.softDelete).mockResolvedValue(undefined);

      await usersService.softDelete('user-123');

      expect(usersRepository.softDelete).toHaveBeenCalledWith('user-123');
      expect(valkeyService.del).toHaveBeenCalledWith('user:user-123');
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      vi.mocked(usersRepository.update).mockResolvedValue(createMockUser());

      await usersService.updateLastLogin('user-123');

      expect(usersRepository.update).toHaveBeenCalledWith('user-123', { lastLoginAt: expect.any(Date) });
    });
  });

  describe('OAuth finders', () => {
    it('should find user by Google ID', async () => {
      const user = createMockUser({ googleId: 'google-123' });
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(user);

      const result = await usersService.findByGoogleId('google-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when Google user not found', async () => {
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(null);

      await expect(usersService.findByGoogleId('google-123')).rejects.toThrow('User not found');
    });

    it('should find user by Facebook ID', async () => {
      const user = createMockUser({ facebookId: 'fb-123' });
      vi.mocked(usersRepository.findByFacebookId).mockResolvedValue(user);

      const result = await usersService.findByFacebookId('fb-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when Facebook user not found', async () => {
      vi.mocked(usersRepository.findByFacebookId).mockResolvedValue(null);

      await expect(usersService.findByFacebookId('fb-123')).rejects.toThrow('User not found');
    });

    it('should find user by GitHub ID', async () => {
      const user = createMockUser({ githubId: 'gh-123' });
      vi.mocked(usersRepository.findByGithubId).mockResolvedValue(user);

      const result = await usersService.findByGithubId('gh-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when GitHub user not found', async () => {
      vi.mocked(usersRepository.findByGithubId).mockResolvedValue(null);

      await expect(usersService.findByGithubId('gh-123')).rejects.toThrow('User not found');
    });

    it('should find user by Apple ID', async () => {
      const user = createMockUser({ appleId: 'apple-123' });
      vi.mocked(usersRepository.findByAppleId).mockResolvedValue(user);

      const result = await usersService.findByAppleId('apple-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when Apple user not found', async () => {
      vi.mocked(usersRepository.findByAppleId).mockResolvedValue(null);

      await expect(usersService.findByAppleId('apple-123')).rejects.toThrow('User not found');
    });

    it('should find user by TikTok ID', async () => {
      const user = createMockUser({ tiktokId: 'tiktok-123' });
      vi.mocked(usersRepository.findByTiktokId).mockResolvedValue(user);

      const result = await usersService.findByTiktokId('tiktok-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when TikTok user not found', async () => {
      vi.mocked(usersRepository.findByTiktokId).mockResolvedValue(null);

      await expect(usersService.findByTiktokId('tiktok-123')).rejects.toThrow('User not found');
    });
  });

  describe('getUserStats', () => {
    it('should return stats from cache when available', async () => {
      const cachedStats = { storiesCount: 5, totalViews: 100, totalReactions: 20, followersCount: 10, followingCount: 3 };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedStats));

      const result = await usersService.getUserStats('user-123');

      expect(result).toEqual(cachedStats);
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('should return cached stats without hitting repository', async () => {
      const cachedStats = { storiesCount: 0, totalViews: 0, totalReactions: 0, followersCount: 0, followingCount: 0 };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedStats));

      const result = await usersService.getUserStats('user-123');

      expect(result.storiesCount).toBe(0);
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(usersService.getUserStats('user-123')).rejects.toThrow('User not found');
    });

    it('should throw NotFoundException when user is soft deleted', async () => {
      const deletedUser = createMockUser({ deletedAt: new Date() });
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(deletedUser);

      await expect(usersService.getUserStats('user-123')).rejects.toThrow('User not found');
    });
  });
});