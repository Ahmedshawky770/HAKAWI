import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { IUsersRepository, User, CreateUserInput } from '../../common/users/users-repository.interface.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { EmailVerificationService } from './email-verification.service.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockUsersRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<User | null>>>;
  findByEmail: ReturnType<typeof vi.fn<(email: string) => Promise<User | null>>>;
  findByUsername: ReturnType<typeof vi.fn<(username: string) => Promise<User | null>>>;
  findByGoogleId: ReturnType<typeof vi.fn<(googleId: string) => Promise<User | null>>>;
  findByFacebookId: ReturnType<typeof vi.fn<(facebookId: string) => Promise<User | null>>>;
  findByTwitterId: ReturnType<typeof vi.fn<(twitterId: string) => Promise<User | null>>>;
  findByGithubId: ReturnType<typeof vi.fn<(githubId: string) => Promise<User | null>>>;
  findByAppleId: ReturnType<typeof vi.fn<(appleId: string) => Promise<User | null>>>;
  findByTiktokId: ReturnType<typeof vi.fn<(tiktokId: string) => Promise<User | null>>>;
  create: ReturnType<typeof vi.fn<(data: CreateUserInput) => Promise<User>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<User>) => Promise<User>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
};
type MockValkeyService = {
  get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;
  set: ReturnType<typeof vi.fn<(key: string, value: string, ttl?: number) => Promise<void>>>;
  del: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventValidatorService = { emit: ReturnType<typeof vi.fn>; validateEvent: ReturnType<typeof vi.fn> };

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
  accountType: 'reader',
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

describe('EmailVerificationService', () => {
  let emailVerificationService: EmailVerificationService;
  let usersRepository: MockUsersRepository;
  let valkeyService: MockValkeyService;
  let winstonLoggerService: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>(),
      findByEmail: vi.fn<(email: string) => Promise<User | null>>(),
      findByUsername: vi.fn<(username: string) => Promise<User | null>>(),
      create: vi.fn<(data: CreateUserInput) => Promise<User>>(),
      update: vi.fn<(id: string, data: Partial<User>) => Promise<User>>(),
      findByGoogleId: vi.fn<(googleId: string) => Promise<User | null>>(),
      findByFacebookId: vi.fn<(facebookId: string) => Promise<User | null>>(),
      findByTwitterId: vi.fn<(twitterId: string) => Promise<User | null>>(),
      findByGithubId: vi.fn<(githubId: string) => Promise<User | null>>(),
      findByAppleId: vi.fn<(appleId: string) => Promise<User | null>>(),
      findByTiktokId: vi.fn<(tiktokId: string) => Promise<User | null>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
    };

    valkeyService = {
      get: vi.fn<(key: string) => Promise<string | null>>(),
      set: vi.fn<(key: string, value: string, ttl?: number) => Promise<void>>(),
      del: vi.fn<(key: string) => Promise<void>>(),
    };

    winstonLoggerService = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    emailVerificationService = new EmailVerificationService(
      usersRepository,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('generateToken', () => {
    it('should generate a token for existing user', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const token = await emailVerificationService.generateToken('test@example.com');

      expect(token).toMatch(/^\d{8}$/);
      expect(valkeyService.set).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

      await expect(emailVerificationService.generateToken('unknown@example.com')).rejects.toThrow('User not found');
    });
  });

  describe('verifyToken', () => {
    it('should verify token and mark email as verified', async () => {
      const user = createMockUser();
      vi.mocked(valkeyService.get).mockResolvedValue('user-123');
      vi.mocked(usersRepository.findById).mockResolvedValue(user);
      vi.mocked(usersRepository.update).mockResolvedValue(createMockUser({ emailVerified: true }));
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);

      const result = await emailVerificationService.verifyToken('123456');

      expect(result.userId).toBe('user-123');
      expect(usersRepository.update).toHaveBeenCalledWith('user-123', {
        emailVerified: true,
        emailVerificationToken: null,
      });
    });

    it('should throw BadRequestException for invalid token', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      await expect(emailVerificationService.verifyToken('invalid')).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });
  });

  describe('resend', () => {
    it('should resend verification email with cooldown', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const result = await emailVerificationService.resend('test@example.com');

      expect(result.message).toBe('Verification email sent');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('email.verification.requested', {
        userId: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

      await expect(emailVerificationService.resend('unknown@example.com')).rejects.toThrow('User not found');
    });

    it('should throw BadRequestException when email already verified', async () => {
      const user = createMockUser({ emailVerified: true });
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);

      await expect(emailVerificationService.resend('test@example.com')).rejects.toThrow('Email is already verified');
    });

    it('should throw BadRequestException when resend is on cooldown', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);
      vi.mocked(valkeyService.get).mockResolvedValue('1');

      await expect(emailVerificationService.resend('test@example.com')).rejects.toThrow(
        'Please wait before requesting another verification email',
      );
    });
  });

  describe('canResend', () => {
    it('should return true when no cooldown', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      const result = await emailVerificationService.canResend('test@example.com');

      expect(result).toBe(true);
    });

    it('should return false when cooldown is active', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('1');

      const result = await emailVerificationService.canResend('test@example.com');

      expect(result).toBe(false);
    });
  });
});
