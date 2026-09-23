import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { IUsersRepository, User, CreateUserInput, UpdateUserInput } from '../../common/users/users-repository.interface.js';
import { USERS_REPOSITORY } from '../../common/users/users-repository.interface.js';
import { PasswordHasher } from '../../common/utils/password.util.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountType } from '../../common/constants/roles.js';
import { NotFoundException, ConflictException } from '@nestjs/common';

type MockUsersRepository = Partial<IUsersRepository>;
type MockPasswordHasher = Partial<PasswordHasher>;
type MockValkeyService = Partial<ValkeyService>;
type MockWinstonLoggerService = Partial<WinstonLoggerService>;
type MockEventEmitter = Partial<EventEmitter2>;

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
  let eventEmitter: MockEventEmitter;

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
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    usersService = new UsersService(
      usersRepository as IUsersRepository,
      passwordHasher as PasswordHasher,
      valkeyService as ValkeyService,
      eventEmitter as EventEmitter2,
      winstonLoggerService as WinstonLoggerService,
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
});