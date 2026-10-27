import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as speakeasy from 'speakeasy';
import { ConfigService } from '@nestjs/config';

import type { IUsersRepository, UpdateUserInput } from '../../common/users/users-repository.interface.ts';
import { EncryptionService } from '../../common/utils/encryption.util.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { MfaService } from './mfa.service.ts';


vi.mock('speakeasy', () => ({
  totp: {
    verify: vi.fn<(options: speakeasy.TotpOptions) => boolean>(),
  },
  generateSecret: vi.fn<() => { base32: string; otpauth_url: string }>(),
}));

type MockUser = {
  id: string;
  email: string;
  mfaEnabled: boolean;
  totpSecretEncrypted?: string | null;
  adminRole: string | null;
};

type MockUsersRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<MockUser | null>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<UpdateUserInput>) => Promise<void>>>;
};

describe('MfaService', () => {
  let mfaService: MfaService;
  let usersRepository: MockUsersRepository;
  let valkeyService: {
    get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;
    set: ReturnType<typeof vi.fn<(key: string, value: string, ttlSeconds?: number) => Promise<void>>>;
    del: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
  };
  let encryptionService: Partial<EncryptionService>;
  let eventBus: {
    emit: ReturnType<typeof vi.fn<(eventName: string, payload: unknown) => Promise<void>>>;
  };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn<(key: string) => string>> };

  const mockUserId = 'user-123';
  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    mfaEnabled: false,
    totpSecretEncrypted: null,
    adminRole: 'super_admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    usersRepository = {
      findById: vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue(mockUser),
      update: vi.fn<(id: string, data: Partial<UpdateUserInput>) => Promise<void>>().mockResolvedValue(undefined),
    };

    valkeyService = {
      get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
      set: vi.fn<(key: string, value: string, ttlSeconds?: number) => Promise<void>>().mockResolvedValue(undefined),
      del: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
    };

    encryptionService = {
      encrypt: vi.fn<(plaintext: string) => string>().mockImplementation((v: string) => `encrypted:${v}`),
      decrypt: vi.fn<(ciphertext: string) => string>().mockImplementation((v: string) => v.replace('encrypted:', '')),
    };

    eventBus = {
      emit: vi.fn<(eventName: string, payload: unknown) => Promise<void>>().mockResolvedValue(undefined),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    configService = {
      get: vi.fn<(key: string) => string>().mockReturnValue('Hakawi'),
    };

    mfaService = new MfaService(
      usersRepository as unknown as IUsersRepository,
      valkeyService as unknown as ValkeyService,
      logger as unknown as WinstonLoggerService,
      encryptionService as EncryptionService,
      eventBus as unknown as EventValidatorService,
      configService as unknown as ConfigService,
    );
  });

  describe('initiateSetup', () => {
    it('should initiate MFA setup and return secret, QR code, and backup codes', async () => {
      valkeyService.get.mockResolvedValue(null);
      (speakeasy.generateSecret as ReturnType<typeof vi.fn>).mockReturnValue({
        base32: 'TESTSECRET123',
        otpauth_url: 'otpauth://totp/Hakawi:test@example.com?secret=TESTSECRET123&issuer=Hakawi',
      });

      const result = await mfaService.initiateSetup('user-123');

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('otpauthUrl');
      expect(result).toHaveProperty('qrCodeDataUrl');
      expect(result).toHaveProperty('backupCodes');
      expect(result.backupCodes).toHaveLength(8);
      expect(valkeyService.set).toHaveBeenCalled();
    });

    it('should throw if MFA already enabled', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        mfaEnabled: true,
        adminRole: 'super_admin',
      });

      await expect(mfaService.initiateSetup('user-123')).rejects.toThrow('MFA is already enabled');
    });

    it('should throw if user not found', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue(null);

      await expect(mfaService.initiateSetup('user-123')).rejects.toThrow('User not found');
    });
  });

  describe('completeSetup', () => {
    it('should complete setup with valid token', async () => {
      const secret = 'TESTSECRET123';
      const backupCodes = ['ABC123', 'DEF456'];
      valkeyService.get.mockResolvedValue(JSON.stringify({ secret, backupCodes }));
      (speakeasy.totp.verify as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await mfaService.completeSetup('user-123', '123456');

      expect(result).toHaveProperty('backupCodes');
      expect(usersRepository.update).toHaveBeenCalledWith('user-123', expect.objectContaining({
        mfaEnabled: true,
      }));
      expect(valkeyService.del).toHaveBeenCalled();
    });

    it('should throw if temp secret not found', async () => {
      valkeyService.get.mockResolvedValue(null);

      await expect(mfaService.completeSetup('user-123', '123456')).rejects.toThrow('MFA setup session expired');
    });

    it('should throw if invalid token', async () => {
      const secret = 'TESTSECRET123';
      valkeyService.get.mockResolvedValue(JSON.stringify({ secret, backupCodes: [] }));
      (speakeasy.totp.verify as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await expect(mfaService.completeSetup('user-123', '123456')).rejects.toThrow('Invalid verification code');
    });
  });

  describe('verifyToken', () => {
    it('should return verified: false if MFA not enabled', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        mfaEnabled: false,
        adminRole: 'super_admin',
      });

      const result = await mfaService.verifyToken('user-123', '123456');
      expect(result).toEqual({ verified: false });
    });

    it('should return verified: false if user not found', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue(null);

      const result = await mfaService.verifyToken('user-123', '123456');
      expect(result).toEqual({ verified: false });
    });
  });

  describe('disableMfa', () => {
    it('should disable MFA and clean up', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        mfaEnabled: true,
        totpSecretEncrypted: 'encrypted:secret',
        adminRole: 'super_admin',
      });

      await mfaService.disableMfa('user-123');

      expect(usersRepository.update).toHaveBeenCalledWith('user-123', expect.objectContaining({
        totpSecretEncrypted: null,
        mfaEnabled: false,
        mfaEnforcedAt: null,
      }));
      expect(valkeyService.del).toHaveBeenCalledTimes(2);
    });

    it('should throw if MFA not enabled', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        mfaEnabled: false,
        adminRole: 'super_admin',
      });

      await expect(mfaService.disableMfa('user-123')).rejects.toThrow('MFA is not enabled');
    });
  });

  describe('shouldEnforceMfa', () => {
    it('should return true for admin users', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        mfaEnabled: true,
        adminRole: 'super_admin',
      });

      const result = await mfaService.shouldEnforceMfa('user-123');
      expect(result).toBe(true);
    });

    it('should return true for any existing user (enforcement is not admin-gated)', async () => {
      usersRepository.findById = vi.fn<(id: string) => Promise<MockUser | null>>().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        mfaEnabled: true,
        adminRole: null,
      });

      const result = await mfaService.shouldEnforceMfa('user-123');
      expect(result).toBe(true);
    });
  });
});