import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { User, CreateUserInput } from '../../common/users/users-repository.interface.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { TransactionalEmailService } from '../../common/email/transactional-email.service.ts';

import { EmailVerificationService } from './email-verification.service.ts';

type MockUsersRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<User | null>>>;
  findByIds: ReturnType<typeof vi.fn<(ids: readonly string[]) => Promise<User[]>>>;
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
  setIfAbsent: ReturnType<typeof vi.fn<(key: string, value: string, ttlSeconds: number) => Promise<boolean>>>;
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
type MockTransactionalEmailService = {
  send: ReturnType<
    typeof vi.fn<
      (options: {
        to: string;
        subject: string;
        text: string;
        html?: string;
      }) => Promise<{ status: 'sent' | 'not-configured' | 'failed'; to?: string; reason?: string }>
    >
  >;
};

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
  totpSecretEncrypted: null,
  mfaEnabled: false,
  mfaEnforcedAt: null,
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
  let emailSender: MockTransactionalEmailService;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>(),
      findByIds: vi.fn<(ids: readonly string[]) => Promise<User[]>>(),
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
      setIfAbsent: vi.fn<(key: string, value: string, ttlSeconds: number) => Promise<boolean>>(),
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

    // Delivered by default, so a case about the token rather than the mail does not have to opt in.
    // The two delivery-outage cases below override it.
    emailSender = {
      send: vi.fn().mockResolvedValue({ status: 'sent', to: 'test@example.com' }),
    };

    emailVerificationService = new EmailVerificationService(
      usersRepository,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
      emailSender as unknown as TransactionalEmailService,
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

    it('should mint six digits, the length VerifyEmailDto actually accepts', async () => {
      // WHY THIS CASE EXISTS. The generator was `randomInt(10000000, 100000000)` — ALWAYS eight
      // digits — while `VerifyEmailDto` declares `@Length(6, 6)` and `main.ts` installs a global
      // `ValidationPipe` with `forbidNonWhitelisted`. Every token this module minted was rejected by
      // the pipe before `verifyToken` could run, so email verification could never succeed at all.
      // It used to assert `/^\d{8}$/`, which pinned the bug rather than the contract.
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      for (let attempt = 0; attempt < 50; attempt += 1) {
        const token = await emailVerificationService.generateToken('test@example.com');
        expect(token).toHaveLength(6);
        expect(token).toMatch(/^[0-9]{6}$/);
      }
    });

    it('should send the minted code to the user in the mail body', async () => {
      // `register` is a caller of this method, and it was the other half of the bug: the code was
      // minted, stored, and never delivered, because nothing sent it.
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const token = await emailVerificationService.generateToken('test@example.com');

      expect(emailSender.send).toHaveBeenCalledTimes(1);
      const mail = vi.mocked(emailSender.send).mock.calls[0]?.[0];
      expect(mail).toMatchObject({ to: 'test@example.com' });
      expect(mail?.text).toContain(token);
      expect(mail?.html).toContain(token);
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

      await expect(emailVerificationService.generateToken('unknown@example.com')).rejects.toThrow('User not found');
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('should not log the code it just minted', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const token = await emailVerificationService.generateToken('test@example.com');

      // Winston output is aggregated and retained, so a code in a log line is a credential leak with
      // a very long half-life.
      for (const call of vi.mocked(winstonLoggerService.info).mock.calls) {
        expect(call[0]).not.toContain(token);
      }
      for (const call of vi.mocked(winstonLoggerService.warn).mock.calls) {
        expect(call[0]).not.toContain(token);
      }
    });

    it('should not throw when the mail cannot be sent, because the code is already stored', async () => {
      // Principle #14: sending is a side effect. An SMTP outage must not fail a registration.
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(emailSender.send).mockResolvedValue({
        status: 'failed',
        to: 'test@example.com',
        reason: 'connection refused',
      });

      await expect(emailVerificationService.generateToken('test@example.com')).resolves.toMatch(/^\d{6}$/);
      expect(winstonLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('was not delivered'),
        'EmailVerificationService',
      );
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
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(true);

      const result = await emailVerificationService.resend('test@example.com');

      expect(result.message).toBe('Verification email sent');
      expect(emailSender.send).toHaveBeenCalledTimes(1);
      // The event still carries no token, and never may: events are logged, parked in the DLQ and
      // replayed, so a token on this payload would be a credential in three logs and a queue.
      expect(eventValidatorService.emit).toHaveBeenCalledWith('email.verification.requested', {
        userId: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should arm the cooldown atomically, before the code is minted and sent', async () => {
      // The order is the fix. A read-then-write cooldown let concurrent resends — on a `@Public()`
      // route — each deliver their own code; `setIfAbsent` decides the race inside the store, so the
      // winner mints and the rest are refused.
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(true);

      await emailVerificationService.resend('test@example.com');

      expect(valkeyService.setIfAbsent).toHaveBeenCalledWith('email:resend:cooldown:test@example.com', '1', 60);
      expect(emailSender.send).toHaveBeenCalledTimes(1);
    });

    it('should refuse a second concurrent resend that lost the cooldown race', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(false);

      await expect(emailVerificationService.resend('test@example.com')).rejects.toThrow(
        'Please wait before requesting another verification email',
      );
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it('should release the cooldown when nothing was delivered', async () => {
      // The failure mode the old ordering was protecting: a mint that sends nothing must not leave
      // the caller locked out for sixty seconds with nothing to show for it.
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(true);
      vi.mocked(emailSender.send).mockResolvedValue({ status: 'failed', to: 'test@example.com', reason: '421' });

      await emailVerificationService.resend('test@example.com');

      expect(valkeyService.del).toHaveBeenCalledWith('email:resend:cooldown:test@example.com');
    });

    it('should say the mail was not sent when the transporter is not configured', async () => {
      // The response used to be a constant 'Verification email sent' whether or not anything was
      // attempted. It still answers 200 — the request succeeded and the code is valid — but it no
      // longer claims a delivery that did not happen.
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(true);
      vi.mocked(emailSender.send).mockResolvedValue({ status: 'not-configured', to: 'test@example.com' });

      const result = await emailVerificationService.resend('test@example.com');

      expect(result.message).toBe('Verification email could not be sent. Please try again later or contact support.');
    });

    it('should say the mail was not sent when the transport failed', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(true);
      vi.mocked(emailSender.send).mockResolvedValue({
        status: 'failed',
        to: 'test@example.com',
        reason: '421 service unavailable',
      });

      const result = await emailVerificationService.resend('test@example.com');

      expect(result.message).toBe('Verification email could not be sent. Please try again later or contact support.');
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
      // How the cooldown is expressed now: `setIfAbsent` answers false, which is the refusal.
      vi.mocked(valkeyService.setIfAbsent).mockResolvedValue(false);

      await expect(emailVerificationService.resend('test@example.com')).rejects.toThrow(
        'Please wait before requesting another verification email',
      );
      expect(emailSender.send).not.toHaveBeenCalled();
    });
  });

  // WHY THERE IS NO `canResend` SUITE ANY MORE. The read-then-decide helper it tested is gone: the
  // cooldown is now armed atomically with `ValkeyService.setIfAbsent` before the mint, because a
  // read-then-write check on a `@Public()` route let concurrent requests each deliver their own
  // code. The behaviour it used to assert is covered by the resend cases below through the one call
  // that decides it now.
});
