import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IUsersRepository, User } from '../../../common/users/users-repository.interface.ts';

import {
  USER_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  VerificationCooldownException,
  USER_VERIFICATION_TTL_SECONDS,
  USER_VERIFICATION_TOKEN_PREFIX,
  UserVerificationService,
} from './user-verification.service.ts';

type MockValkey = {
  get: Mock<(key: string) => Promise<string | null>>;
  set: Mock<(key: string, value: string, ttl?: number) => Promise<void>>;
  del: Mock<(key: string) => Promise<void>>;
  eval: Mock<(script: string, keys: readonly string[], args?: readonly string[]) => Promise<unknown>>;
};

type MockLogger = { info: Mock; log: Mock; error: Mock; warn: Mock; debug: Mock; verbose: Mock };

const NOW = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'person@example.com',
    username: 'person',
    name: 'Person',
    passwordHash: 'hash',
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
    emailVerified: false,
    emailVerificationToken: null,
    passwordResetToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('UserVerificationService', () => {
  let service: UserVerificationService;
  let usersRepository: { findById: Mock<(id: string) => Promise<User | null>>; update: Mock };
  let valkey: MockValkey;
  let eventBus: { emit: Mock<(name: string, payload: unknown) => Promise<void>> };
  let logger: MockLogger;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>().mockResolvedValue(user()),
      update: vi.fn().mockResolvedValue(user({ isVerified: true })),
    };
    valkey = {
      get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
      set: vi.fn<(key: string, value: string, ttl?: number) => Promise<void>>().mockResolvedValue(undefined),
      del: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
      eval: vi
        .fn<(script: string, keys: readonly string[], args?: readonly string[]) => Promise<unknown>>()
        .mockResolvedValue(null),
    };
    eventBus = { emit: vi.fn<(name: string, payload: unknown) => Promise<void>>().mockResolvedValue(undefined) };
    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };

    service = new UserVerificationService(
      usersRepository as unknown as IUsersRepository,
      valkey as unknown as ValkeyService,
      logger as unknown as WinstonLoggerService,
      eventBus as unknown as EventValidatorService,
    );
  });

  describe('request', () => {
    it('should store a token that maps back to the user', async () => {
      await service.request(USER_ID);

      expect(valkey.set).toHaveBeenCalledWith(
        expect.stringContaining(USER_VERIFICATION_TOKEN_PREFIX),
        USER_ID,
        USER_VERIFICATION_TTL_SECONDS,
      );
    });

    it('should arm the resend cooldown', async () => {
      await service.request(USER_ID);

      expect(valkey.set).toHaveBeenCalledWith(
        `${USER_VERIFICATION_TOKEN_PREFIX}cooldown:${USER_ID}`,
        '1',
        USER_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      );
    });

    it('should announce the request on the event bus', async () => {
      await service.request(USER_ID);

      expect(eventBus.emit).toHaveBeenCalledWith('email.verification.requested', {
        userId: USER_ID,
        email: 'person@example.com',
      });
    });

    it('should do nothing for a user who is already verified', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ isVerified: true }));

      await expect(service.request(USER_ID)).resolves.toEqual({
        userId: USER_ID,
        alreadyVerified: true,
        cooldownSeconds: 0,
      });
      expect(valkey.set).not.toHaveBeenCalled();
    });

    it('should respect an armed cooldown', async () => {
      vi.mocked(valkey.get).mockResolvedValue('1');

      await expect(service.request(USER_ID)).resolves.toEqual({
        userId: USER_ID,
        alreadyVerified: false,
        cooldownSeconds: USER_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      });
      expect(valkey.set).not.toHaveBeenCalled();
    });

    it('should reject an unknown user', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(service.request(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should reject a soft deleted user', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ deletedAt: NOW }));

      await expect(service.request(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    it('should set isVerified on the user row', async () => {
      vi.mocked(valkey.eval).mockResolvedValue(USER_ID);

      const result = await service.confirm('a'.repeat(48));

      expect(usersRepository.update).toHaveBeenCalledWith(USER_ID, {
        isVerified: true,
        emailVerified: true,
        emailVerificationToken: null,
      });
      expect(result).toMatchObject({ userId: USER_ID, isVerified: true });
    });

    it('should emit email.verified once the flag is written', async () => {
      vi.mocked(valkey.eval).mockResolvedValue(USER_ID);

      await service.confirm('a'.repeat(48));

      expect(eventBus.emit).toHaveBeenCalledWith('email.verified', { userId: USER_ID, email: 'person@example.com' });
    });

    it('should reject an unknown or expired token', async () => {
      vi.mocked(valkey.eval).mockResolvedValue(null);

      await expect(service.confirm('nope')).rejects.toThrow(BadRequestException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('should reject a token whose user has since been deleted', async () => {
      vi.mocked(valkey.eval).mockResolvedValue(USER_ID);
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(service.confirm('a'.repeat(48))).rejects.toThrow(NotFoundException);
    });

    it('should read the token through one atomic get-and-delete, not a plain lookup', async () => {
      vi.mocked(valkey.eval).mockResolvedValue(USER_ID);

      await service.confirm('a'.repeat(48));

      // A `GET` here would leave the token valid for its whole 24 hour TTL.
      expect(valkey.get).not.toHaveBeenCalledWith(`${USER_VERIFICATION_TOKEN_PREFIX}${'a'.repeat(48)}`);
      expect(valkey.eval).toHaveBeenCalledWith(expect.any(String), [
        `${USER_VERIFICATION_TOKEN_PREFIX}${'a'.repeat(48)}`,
      ]);
    });

    it('should refuse a replayed token once the first confirm has consumed it', async () => {
      // The script is atomic, so a token yields its user id to exactly one caller.
      const stored = new Map<string, string>([[`${USER_VERIFICATION_TOKEN_PREFIX}replayed`, USER_ID]]);
      vi.mocked(valkey.eval).mockImplementation(async (_script, keys) => {
        const key = keys[0] ?? '';
        const value = stored.get(key);
        if (value === undefined) {
          return null;
        }
        stored.delete(key);
        return value;
      });

      await expect(service.confirm('replayed')).resolves.toMatchObject({ isVerified: true });
      await expect(service.confirm('replayed')).rejects.toThrow(BadRequestException);

      expect(usersRepository.update).toHaveBeenCalledTimes(1);
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
    });

    it('should let only one of two concurrent confirms of the same token succeed', async () => {
      const stored = new Map<string, string>([[`${USER_VERIFICATION_TOKEN_PREFIX}shared`, USER_ID]]);
      vi.mocked(valkey.eval).mockImplementation(async (_script, keys) => {
        const key = keys[0] ?? '';
        const value = stored.get(key);
        if (value === undefined) {
          return null;
        }
        stored.delete(key);
        // Yield so the second call interleaves exactly as two real requests would.
        await Promise.resolve();
        return value;
      });

      const results = await Promise.allSettled([service.confirm('shared'), service.confirm('shared')]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(usersRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should treat an empty valkey answer as an invalid token', async () => {
      vi.mocked(valkey.eval).mockResolvedValue('');

      await expect(service.confirm('empty')).rejects.toThrow(BadRequestException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should report a verified user', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ isVerified: true }));

      await expect(service.status(USER_ID)).resolves.toEqual({
        userId: USER_ID,
        isVerified: true,
        verifiedAt: null,
      });
    });

    it('should report the verification timestamp when one was recorded', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ isVerified: true }));
      vi.mocked(valkey.get).mockResolvedValue('2026-01-01T00:00:00.000Z');

      await expect(service.status(USER_ID)).resolves.toEqual({
        userId: USER_ID,
        isVerified: true,
        verifiedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('should treat a null isVerified column as unverified', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ isVerified: null }));

      await expect(service.status(USER_ID)).resolves.toMatchObject({ isVerified: false });
    });

    it('should reject an unknown user', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(service.status(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('issueToken', () => {
    it('should return a hexadecimal token bound to the user', async () => {
      const token = await service.issueToken(USER_ID);

      expect(token).toMatch(/^[a-f0-9]{48}$/);
      expect(valkey.set).toHaveBeenCalledWith(
        `${USER_VERIFICATION_TOKEN_PREFIX}${token}`,
        USER_ID,
        USER_VERIFICATION_TTL_SECONDS,
      );
    });

    it('should arm the resend cooldown it now shares with request', async () => {
      await service.issueToken(USER_ID);

      expect(valkey.set).toHaveBeenCalledWith(
        `${USER_VERIFICATION_TOKEN_PREFIX}cooldown:${USER_ID}`,
        '1',
        USER_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      );
    });

    it('should refuse to mint a second token while the cooldown is armed', async () => {
      vi.mocked(valkey.get).mockResolvedValue('1');

      await expect(service.issueToken(USER_ID)).rejects.toThrow(VerificationCooldownException);
      expect(valkey.set).not.toHaveBeenCalled();
    });

    it('should answer a cooldown refusal with 429 rather than a 400', async () => {
      vi.mocked(valkey.get).mockResolvedValue('1');

      const failure = await service.issueToken(USER_ID).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(VerificationCooldownException);
      expect((failure as VerificationCooldownException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((failure as VerificationCooldownException).message).toContain(
        String(USER_VERIFICATION_RESEND_COOLDOWN_SECONDS),
      );
    });

    it('should announce the request on the event bus', async () => {
      await service.issueToken(USER_ID);

      expect(eventBus.emit).toHaveBeenCalledWith('email.verification.requested', {
        userId: USER_ID,
        email: 'person@example.com',
      });
    });

    it('should refuse to mint a token for a user who is already verified', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ isVerified: true }));

      await expect(service.issueToken(USER_ID)).rejects.toThrow(BadRequestException);
      expect(valkey.set).not.toHaveBeenCalled();
    });

    it('should reject an unknown user', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(service.issueToken(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should reject a soft deleted user', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(user({ deletedAt: NOW }));

      await expect(service.issueToken(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
