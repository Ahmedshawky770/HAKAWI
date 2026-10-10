import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';

import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { AccountLockoutService } from './account-lockout.service.ts';

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  incrWithTtl: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockConfigService = {
  get: ReturnType<typeof vi.fn>;
};

describe('AccountLockoutService', () => {
  let service: AccountLockoutService;
  let valkeyService: MockValkeyService;
  let logger: MockWinstonLoggerService;
  let configService: MockConfigService;

  beforeEach(() => {
    vi.clearAllMocks();

    valkeyService = {
      exists: vi.fn().mockResolvedValue(false),
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(undefined),
      incrWithTtl: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(900),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    configService = {
      get: vi.fn().mockReturnValue(undefined),
    };

    service = new AccountLockoutService(
      valkeyService as unknown as ValkeyService,
      logger as unknown as WinstonLoggerService,
      configService as unknown as ConfigService,
    );
  });

  describe('recordFailedAttempt', () => {
    it('should record failed attempt for both user and IP', async () => {
      valkeyService.incrWithTtl
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const result = await service.recordFailedAttempt('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(1);
      expect(result.remainingAttempts).toBe(4);
      expect(valkeyService.incrWithTtl).toHaveBeenCalledTimes(2);
    });

    it('should record failed attempt for IP only when userId is null', async () => {
      valkeyService.incrWithTtl.mockResolvedValueOnce(2);

      const result = await service.recordFailedAttempt(null, '192.168.1.1');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(2);
      expect(valkeyService.incrWithTtl).toHaveBeenCalledTimes(1);
    });

    it('should lock account when max attempts reached', async () => {
      valkeyService.incrWithTtl
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(1);

      const result = await service.recordFailedAttempt('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(true);
      expect(result.failedAttempts).toBe(5);
      expect(result.remainingAttempts).toBe(0);
      expect(valkeyService.set).toHaveBeenCalled();
      expect(valkeyService.del).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should lock IP when max attempts reached', async () => {
      valkeyService.incrWithTtl
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5);

      const result = await service.recordFailedAttempt('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
    });

    it('should return locked status if user is already locked', async () => {
      valkeyService.exists.mockResolvedValueOnce(true);
      valkeyService.ttl.mockResolvedValueOnce(600);
      valkeyService.incrWithTtl.mockResolvedValueOnce(1);

      const result = await service.recordFailedAttempt('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(true);
      expect(result.lockoutExpiresAt).toBeDefined();
    });

    it('should return locked status if IP is already locked', async () => {
      valkeyService.exists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      valkeyService.ttl.mockResolvedValueOnce(300);
      valkeyService.incrWithTtl.mockResolvedValueOnce(3);

      const result = await service.recordFailedAttempt('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(true);
    });

    it('should merge statuses and return most restrictive', async () => {
      valkeyService.incrWithTtl
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.recordFailedAttempt('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(true);
    });
  });

  describe('checkStatus', () => {
    it('should check status for both user and IP', async () => {
      valkeyService.get
        .mockResolvedValueOnce('2')
        .mockResolvedValueOnce('1');

      const result = await service.checkStatus('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(2);
      expect(valkeyService.get).toHaveBeenCalledTimes(2);
    });

    it('should return locked if user is locked', async () => {
      valkeyService.exists.mockResolvedValueOnce(true);
      valkeyService.ttl.mockResolvedValueOnce(600);

      const result = await service.checkStatus('user-123', '192.168.1.1');

      expect(result.isLocked).toBe(true);
    });

    it('should return zero attempts if no previous attempts', async () => {
      valkeyService.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.checkStatus('user-123', '192.168.1.1');

      expect(result.failedAttempts).toBe(0);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should check status for IP only when userId is null', async () => {
      valkeyService.get.mockResolvedValueOnce('3');

      const result = await service.checkStatus(null, '192.168.1.1');

      expect(result.failedAttempts).toBe(3);
      expect(valkeyService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearOnSuccess', () => {
    it('should clear lockout for both user and IP', async () => {
      await service.clearOnSuccess('user-123', '192.168.1.1');

      expect(valkeyService.del).toHaveBeenCalledTimes(4);
    });

    it('should clear lockout for IP only when userId is null', async () => {
      await service.clearOnSuccess(null, '192.168.1.1');

      expect(valkeyService.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('unlockUser', () => {
    it('should unlock user and log', async () => {
      await service.unlockUser('user-123');

      expect(valkeyService.del).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        'Manually unlocked user user-123',
        'AccountLockoutService',
      );
    });
  });

  describe('unlockIp', () => {
    it('should unlock IP and log', async () => {
      await service.unlockIp('192.168.1.1');

      expect(valkeyService.del).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        'Manually unlocked IP 192.168.1.1',
        'AccountLockoutService',
      );
    });
  });

  describe('progressive delay', () => {
    it('should calculate exponential backoff', async () => {
      valkeyService.incrWithTtl.mockResolvedValueOnce(3);

      const result = await service.recordFailedAttempt(null, '192.168.1.1');

      // 1000 * 2^(3-1) = 4000
      expect(result.nextAttemptDelayMs).toBe(4000);
    });

    it('should cap delay at max', async () => {
      valkeyService.incrWithTtl.mockResolvedValueOnce(10);

      const result = await service.recordFailedAttempt(null, '192.168.1.1');

      expect(result.nextAttemptDelayMs).toBe(300000);
    });

    it('should return 0 delay for 0 attempts', async () => {
      valkeyService.get.mockResolvedValueOnce(null);

      const result = await service.checkStatus(null, '192.168.1.1');

      expect(result.nextAttemptDelayMs).toBe(0);
    });
  });

  describe('mergeStatus edge cases', () => {
    it('should handle empty statuses array', async () => {
      // Access private method via any is not allowed per zero-any policy
      // Instead test via public API behavior
      valkeyService.exists.mockResolvedValue(false);
      valkeyService.get.mockResolvedValue(null);

      const result = await service.checkStatus(null, '192.168.1.1');
      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(0);
    });
  });
});
