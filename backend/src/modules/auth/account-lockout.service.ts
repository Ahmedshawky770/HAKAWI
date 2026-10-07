import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

export interface LockoutConfig {
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  progressiveDelayBaseMs: number;
  progressiveDelayMaxMs: number;
  resetWindowMinutes: number;
}

export interface LockoutStatus {
  isLocked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  lockoutExpiresAt: number | null;
  nextAttemptDelayMs: number;
}

@Injectable()
export class AccountLockoutService {
  private readonly USER_ATTEMPTS_PREFIX = 'auth:lockout:user:';
  private readonly IP_ATTEMPTS_PREFIX = 'auth:lockout:ip:';
  private readonly USER_LOCK_PREFIX = 'auth:lockout:user:lock:';
  private readonly IP_LOCK_PREFIX = 'auth:lockout:ip:lock:';

  private readonly config: LockoutConfig;

  constructor(
    @Inject(ValkeyService) private readonly valkey: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    private readonly configService: ConfigService,
  ) {
    this.config = {
      maxFailedAttempts: configService.get<number>('ACCOUNT_LOCKOUT_MAX_ATTEMPTS') ?? 5,
      lockoutDurationMinutes: configService.get<number>('ACCOUNT_LOCKOUT_DURATION_MINUTES') ?? 15,
      progressiveDelayBaseMs: configService.get<number>('ACCOUNT_LOCKOUT_DELAY_BASE_MS') ?? 1000,
      progressiveDelayMaxMs: configService.get<number>('ACCOUNT_LOCKOUT_DELAY_MAX_MS') ?? 300000,
      resetWindowMinutes: configService.get<number>('ACCOUNT_LOCKOUT_RESET_WINDOW_MINUTES') ?? 60,
    };
  }

  /**
   * Record a failed login attempt for a user and/or IP.
   * Returns the lockout status after the attempt.
   */
  async recordFailedAttempt(userId: string | null, ip: string): Promise<LockoutStatus> {
    const promises: Promise<LockoutStatus>[] = [];

    if (userId) {
      promises.push(this.recordUserFailedAttempt(userId));
    }
    promises.push(this.recordIpFailedAttempt(ip));

    const results = await Promise.all(promises);

    // Return the more restrictive status
    const userStatus = results[0];
    const ipStatus = results[results.length - 1];

    return this.mergeStatus(userStatus, ipStatus);
  }

  /**
   * Record a failed attempt for a specific user.
   */
  private async recordUserFailedAttempt(userId: string): Promise<LockoutStatus> {
    const attemptsKey = `${this.USER_ATTEMPTS_PREFIX}${userId}`;
    const lockKey = `${this.USER_LOCK_PREFIX}${userId}`;

    // Check if already locked
    const isLocked = await this.valkey.exists(lockKey);
    if (isLocked) {
      const ttl = await this.valkey.ttl(lockKey);
      return {
        isLocked: true,
        failedAttempts: this.config.maxFailedAttempts,
        remainingAttempts: 0,
        lockoutExpiresAt: Date.now() + (ttl > 0 ? ttl * 1000 : 0),
        nextAttemptDelayMs: this.config.progressiveDelayMaxMs,
      };
    }

    // Increment attempts with TTL
    const attempts = await this.valkey.incrWithTtl(attemptsKey, this.config.resetWindowMinutes * 60);

    const remainingAttempts = Math.max(0, this.config.maxFailedAttempts - attempts);
    const nextAttemptDelayMs = this.calculateProgressiveDelay(attempts);

    if (attempts >= this.config.maxFailedAttempts) {
      // Lock the account
      await this.valkey.set(
        lockKey,
        'locked',
        this.config.lockoutDurationMinutes * 60,
      );
      // Clear the attempts counter since we're now locked
      await this.valkey.del(attemptsKey);

      this.logger.warn(
        `Account locked for user ${userId} after ${attempts} failed attempts`,
        'AccountLockoutService',
      );

      return {
        isLocked: true,
        failedAttempts: attempts,
        remainingAttempts: 0,
        lockoutExpiresAt: Date.now() + this.config.lockoutDurationMinutes * 60 * 1000,
        nextAttemptDelayMs: this.config.progressiveDelayMaxMs,
      };
    }

    return {
      isLocked: false,
      failedAttempts: attempts,
      remainingAttempts,
      lockoutExpiresAt: null,
      nextAttemptDelayMs,
    };
  }

  /**
   * Record a failed attempt for an IP address.
   */
  private async recordIpFailedAttempt(ip: string): Promise<LockoutStatus> {
    const attemptsKey = `${this.IP_ATTEMPTS_PREFIX}${ip}`;
    const lockKey = `${this.IP_LOCK_PREFIX}${ip}`;

    const isLocked = await this.valkey.exists(lockKey);
    if (isLocked) {
      const ttl = await this.valkey.ttl(lockKey);
      return {
        isLocked: true,
        failedAttempts: this.config.maxFailedAttempts,
        remainingAttempts: 0,
        lockoutExpiresAt: Date.now() + (ttl > 0 ? ttl * 1000 : 0),
        nextAttemptDelayMs: this.config.progressiveDelayMaxMs,
      };
    }

    const attempts = await this.valkey.incrWithTtl(attemptsKey, this.config.resetWindowMinutes * 60);

    const remainingAttempts = Math.max(0, this.config.maxFailedAttempts - attempts);
    const nextAttemptDelayMs = this.calculateProgressiveDelay(attempts);

    if (attempts >= this.config.maxFailedAttempts) {
      await this.valkey.set(lockKey, 'locked', this.config.lockoutDurationMinutes * 60);
      await this.valkey.del(attemptsKey);

      this.logger.warn(
        `IP locked: ${ip} after ${attempts} failed attempts`,
        'AccountLockoutService',
      );

      return {
        isLocked: true,
        failedAttempts: attempts,
        remainingAttempts: 0,
        lockoutExpiresAt: Date.now() + this.config.lockoutDurationMinutes * 60 * 1000,
        nextAttemptDelayMs: this.config.progressiveDelayMaxMs,
      };
    }

    return {
      isLocked: false,
      failedAttempts: attempts,
      remainingAttempts,
      lockoutExpiresAt: null,
      nextAttemptDelayMs,
    };
  }

  /**
   * Check lockout status without recording an attempt.
   */
  async checkStatus(userId: string | null, ip: string): Promise<LockoutStatus> {
    const promises: Promise<LockoutStatus>[] = [];

    if (userId) {
      promises.push(this.checkUserStatus(userId));
    }
    promises.push(this.checkIpStatus(ip));

    const results = await Promise.all(promises);
    return this.mergeStatus(...results);
  }

  private async checkUserStatus(userId: string): Promise<LockoutStatus> {
    const lockKey = `${this.USER_LOCK_PREFIX}${userId}`;
    const attemptsKey = `${this.USER_ATTEMPTS_PREFIX}${userId}`;

    const isLocked = await this.valkey.exists(lockKey);
    if (isLocked) {
      const ttl = await this.valkey.ttl(lockKey);
      return {
        isLocked: true,
        failedAttempts: this.config.maxFailedAttempts,
        remainingAttempts: 0,
        lockoutExpiresAt: Date.now() + (ttl > 0 ? ttl * 1000 : 0),
        nextAttemptDelayMs: this.config.progressiveDelayMaxMs,
      };
    }

    const attemptsStr = await this.valkey.get(attemptsKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    return {
      isLocked: false,
      failedAttempts: attempts,
      remainingAttempts: Math.max(0, this.config.maxFailedAttempts - attempts),
      lockoutExpiresAt: null,
      nextAttemptDelayMs: this.calculateProgressiveDelay(attempts),
    };
  }

  private async checkIpStatus(ip: string): Promise<LockoutStatus> {
    const lockKey = `${this.IP_LOCK_PREFIX}${ip}`;
    const attemptsKey = `${this.IP_ATTEMPTS_PREFIX}${ip}`;

    const isLocked = await this.valkey.exists(lockKey);
    if (isLocked) {
      const ttl = await this.valkey.ttl(lockKey);
      return {
        isLocked: true,
        failedAttempts: this.config.maxFailedAttempts,
        remainingAttempts: 0,
        lockoutExpiresAt: Date.now() + (ttl > 0 ? ttl * 1000 : 0),
        nextAttemptDelayMs: this.config.progressiveDelayMaxMs,
      };
    }

    const attemptsStr = await this.valkey.get(attemptsKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    return {
      isLocked: false,
      failedAttempts: attempts,
      remainingAttempts: Math.max(0, this.config.maxFailedAttempts - attempts),
      lockoutExpiresAt: null,
      nextAttemptDelayMs: this.calculateProgressiveDelay(attempts),
    };
  }

  /**
   * Clear lockout and attempts on successful login.
   */
  async clearOnSuccess(userId: string | null, ip: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (userId) {
      promises.push(this.clearUserLockout(userId));
    }
    promises.push(this.clearIpLockout(ip));

    await Promise.all(promises);
  }

  private async clearUserLockout(userId: string): Promise<void> {
    await Promise.all([
      this.valkey.del(`${this.USER_ATTEMPTS_PREFIX}${userId}`),
      this.valkey.del(`${this.USER_LOCK_PREFIX}${userId}`),
    ]);
  }

  private async clearIpLockout(ip: string): Promise<void> {
    await Promise.all([
      this.valkey.del(`${this.IP_ATTEMPTS_PREFIX}${ip}`),
      this.valkey.del(`${this.IP_LOCK_PREFIX}${ip}`),
    ]);
  }

  /**
   * Manually unlock a user (admin operation).
   */
  async unlockUser(userId: string): Promise<void> {
    await this.clearUserLockout(userId);
    this.logger.info(`Manually unlocked user ${userId}`, 'AccountLockoutService');
  }

  /**
   * Manually unlock an IP (admin operation).
   */
  async unlockIp(ip: string): Promise<void> {
    await this.clearIpLockout(ip);
    this.logger.info(`Manually unlocked IP ${ip}`, 'AccountLockoutService');
  }

  private calculateProgressiveDelay(attempts: number): number {
    if (attempts <= 0) return 0;
    // Exponential backoff: base * 2^(attempts-1), capped at max
    const delay = this.config.progressiveDelayBaseMs * Math.pow(2, attempts - 1);
    return Math.min(delay, this.config.progressiveDelayMaxMs);
  }

  private mergeStatus(...statuses: LockoutStatus[]): LockoutStatus {
    if (statuses.length === 0) {
      return {
        isLocked: false,
        failedAttempts: 0,
        remainingAttempts: this.config.maxFailedAttempts,
        lockoutExpiresAt: null,
        nextAttemptDelayMs: 0,
      };
    }

    // If any is locked, the result is locked
    const lockedStatus = statuses.find((s) => s.isLocked);
    if (lockedStatus) {
      return lockedStatus;
    }

    // Otherwise, return the most restrictive (highest attempts)
    return statuses.reduce((max, current) =>
      current.failedAttempts > max.failedAttempts ? current : max,
    );
  }
}