import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

import { ConfigService } from '@nestjs/config';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EncryptionService } from '../../common/utils/encryption.util.ts';
import type { IUsersRepository } from '../../common/users/users-repository.interface.ts';
import { USERS_REPOSITORY } from '../../common/users/users-repository.interface.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

const TOTP_ISSUER = 'Hakawi';
const TOTP_SECRET_PREFIX = 'mfa:totp:';
const TOTP_SECRET_TTL = 10 * 60; // 10 minutes for setup flow
const BACKUP_CODES_PREFIX = 'mfa:backup_codes:';
const BACKUP_CODES_COUNT = 8;

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export interface MfaVerificationResult {
  verified: boolean;
  backupCodeUsed?: boolean;
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(ValkeyService) private readonly valkey: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initiate MFA setup for a user.
   * Returns the secret, otpauth URL, QR code, and backup codes.
   * The secret is stored temporarily in Valkey until verified.
   */
  async initiateSetup(userId: string): Promise<MfaSetupResult> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled for this account');
    }

    // Generate a new TOTP secret
    const secret = speakeasy.generateSecret({
      name: `${TOTP_ISSUER}:${user.email}`,
      issuer: TOTP_ISSUER,
      length: 20,
    });

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store secret and backup codes temporarily in Valkey
    const tempKey = `${TOTP_SECRET_PREFIX}${userId}`;
    await this.valkey.set(tempKey, JSON.stringify({
      secret: secret.base32,
      backupCodes,
    }), TOTP_SECRET_TTL);

    // Generate QR code
    const otpauthUrl = secret.otpauth_url!;
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    this.logger.info(`MFA setup initiated for user ${userId}`, 'MfaService');

    return {
      secret: secret.base32,
      otpauthUrl,
      qrCodeDataUrl,
      backupCodes,
    };
  }

  /**
   * Complete MFA setup by verifying the first TOTP code.
   * If valid, encrypts and stores the secret on the user record.
   */
  async completeSetup(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const tempKey = `${TOTP_SECRET_PREFIX}${userId}`;
    const tempData = await this.valkey.get(tempKey);

    if (!tempData) {
      throw new BadRequestException('MFA setup session expired or not found. Please restart setup.');
    }

    const { secret, backupCodes } = JSON.parse(tempData);

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // Allow 30s clock drift
    });

    if (!verified) {
      this.logger.warn(`MFA setup failed: invalid token for user ${userId}`, 'MfaService');
      throw new BadRequestException('Invalid verification code');
    }

    // Encrypt and store the secret
    const encryptedSecret = await this.encryption.encrypt(secret);

    // Hash backup codes for storage (bcrypt-like but we'll use our encryption)
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code: string) => this.encryption.encrypt(code))
    );

    await this.usersRepository.update(userId, {
      totpSecretEncrypted: encryptedSecret,
      mfaEnabled: true,
      mfaEnforcedAt: new Date(),
    });

    // Store hashed backup codes in Valkey (with longer TTL - 1 year)
    const backupKey = `${BACKUP_CODES_PREFIX}${userId}`;
    await this.valkey.set(backupKey, JSON.stringify(hashedBackupCodes), 365 * 24 * 60 * 60);

    // Clean up temp secret
    await this.valkey.del(tempKey);

    // Emit event
    await this.eventBus.emit('mfa.enabled', { userId });

    this.logger.info(`MFA enabled for user ${userId}`, 'MfaService');

    return { backupCodes };
  }

  /**
   * Verify a TOTP token for a user.
   * Also checks backup codes if TOTP fails.
   */
  async verifyToken(userId: string, token: string): Promise<MfaVerificationResult> {
    const user = await this.usersRepository.findById(userId);
    if (!user || !user.mfaEnabled || !user.totpSecretEncrypted) {
      return { verified: false };
    }

    // Decrypt the secret
    const secret = await this.encryption.decrypt(user.totpSecretEncrypted);

    // Try TOTP first
    const totpVerified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (totpVerified) {
      return { verified: true, backupCodeUsed: false };
    }

    // Try backup codes
    const backupKey = `${BACKUP_CODES_PREFIX}${userId}`;
    const storedCodesJson = await this.valkey.get(backupKey);

    if (storedCodesJson) {
      const storedCodes = JSON.parse(storedCodesJson);
      for (let i = 0; i < storedCodes.length; i++) {
        const decrypted = await this.encryption.decrypt(storedCodes[i]);
        if (timingSafeEqualStrings(decrypted, token)) {
          // Remove used backup code (one-time use)
          storedCodes.splice(i, 1);
          await this.valkey.set(backupKey, JSON.stringify(storedCodes), 365 * 24 * 60 * 60);
          this.logger.info(`MFA backup code used for user ${userId}`, 'MfaService');
          return { verified: true, backupCodeUsed: true };
        }
      }
    }

    this.logger.warn(`MFA verification failed for user ${userId}`, 'MfaService');
    return { verified: false };
  }

  /**
   * Disable MFA for a user (requires password confirmation elsewhere).
   */
  async disableMfa(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user || !user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    await this.usersRepository.update(userId, {
      totpSecretEncrypted: null,
      mfaEnabled: false,
      mfaEnforcedAt: null,
    });

    await this.valkey.del(`${BACKUP_CODES_PREFIX}${userId}`);
    await this.valkey.del(`${TOTP_SECRET_PREFIX}${userId}`);

    await this.eventBus.emit('mfa.disabled', { userId });

    this.logger.info(`MFA disabled for user ${userId}`, 'MfaService');
  }

  /**
   * Check if MFA is enabled for a user.
   */
  async isMfaEnabled(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findById(userId);
    return user?.mfaEnabled === true;
  }

  /**
   * Get remaining backup codes count (without revealing them).
   */
  async getBackupCodesCount(userId: string): Promise<number> {
    const backupKey = `${BACKUP_CODES_PREFIX}${userId}`;
    const storedCodesJson = await this.valkey.get(backupKey);
    if (!storedCodesJson) return 0;
    return JSON.parse(storedCodesJson).length;
  }

  /**
   * Regenerate backup codes (invalidates old ones).
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const user = await this.usersRepository.findById(userId);
    if (!user || !user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled for this account');
    }

    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => this.encryption.encrypt(code))
    );

    const backupKey = `${BACKUP_CODES_PREFIX}${userId}`;
    await this.valkey.set(backupKey, JSON.stringify(hashedBackupCodes), 365 * 24 * 60 * 60);

    this.logger.info(`MFA backup codes regenerated for user ${userId}`, 'MfaService');
    return backupCodes;
  }

  /**
   * Check if MFA should be enforced for a user (admin accounts).
   */
  async shouldEnforceMfa(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findById(userId);
    return user?.adminRole !== null && user?.adminRole !== undefined;
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
      // 8 alphanumeric characters, easy to type
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }
}

/**
 * Timing-safe string comparison (copied from auth.service.ts to avoid circular dependency).
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

import crypto from 'crypto';