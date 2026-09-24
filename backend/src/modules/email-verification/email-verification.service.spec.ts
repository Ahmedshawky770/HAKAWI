import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailVerificationService } from './email-verification.service.js';
import type { IUsersRepository, User } from '../../common/users/users-repository.interface.js';
import { USERS_REPOSITORY } from '../../common/users/users-repository.interface.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockUsersRepository = Partial<IUsersRepository>;
type MockValkeyService = Partial<ValkeyService>;
type MockWinstonLoggerService = Partial<WinstonLoggerService>;
type MockEventEmitter = { emit: ReturnType<typeof vi.fn> };

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
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('EmailVerificationService', () => {
  let emailVerificationService: EmailVerificationService;
  let usersRepository: MockUsersRepository;
  let valkeyService: MockValkeyService;
  let winstonLoggerService: MockWinstonLoggerService;
  let eventEmitter: MockEventEmitter;

  beforeEach(() => {
    usersRepository = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };

    winstonLoggerService = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() };

    emailVerificationService = new EmailVerificationService(
      usersRepository as IUsersRepository,
      valkeyService as ValkeyService,
      winstonLoggerService as WinstonLoggerService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('generateToken', () => {
    it('should generate a token for existing user', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const token = await emailVerificationService.generateToken('test@example.com');

      expect(token).toMatch(/^\d{6}$/);
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
      expect(usersRepository.update).toHaveBeenCalledWith('user-123', { emailVerified: true, emailVerificationToken: null });
    });

    it('should throw BadRequestException for invalid token', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);

      await expect(emailVerificationService.verifyToken('invalid')).rejects.toThrow('Invalid or expired verification token');
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('email.verification.requested', { userId: 'user-123', email: 'test@example.com' });
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

      await expect(emailVerificationService.resend('test@example.com')).rejects.toThrow('Please wait before requesting another verification email');
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
