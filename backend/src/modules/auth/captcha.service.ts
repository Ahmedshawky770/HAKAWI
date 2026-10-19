import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

export interface CaptchaConfig {
  provider: 'turnstile' | 'hcaptcha' | 'recaptcha' | 'none';
  secretKey: string;
  verifyUrl: string;
  siteKey: string;
}

export interface CaptchaVerificationResult {
  success: boolean;
  score?: number;
  hostname?: string;
  challengeTs?: string;
  errorCodes?: string[];
}

@Injectable()
export class CaptchaService {
  private readonly config: CaptchaConfig;

  constructor(
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    private readonly configService: ConfigService,
  ) {
    const provider = (configService.get<string>('CAPTCHA_PROVIDER') ?? 'none') as CaptchaConfig['provider'];

    if (provider === 'none') {
      this.config = { provider: 'none', secretKey: '', verifyUrl: '', siteKey: '' };
      return;
    }

    const secretKey = configService.get<string>(`CAPTCHA_${provider.toUpperCase()}_SECRET_KEY`) ?? '';
    const siteKey = configService.get<string>(`CAPTCHA_${provider.toUpperCase()}_SITE_KEY`) ?? '';

    const verifyUrls = {
      turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      hcaptcha: 'https://hcaptcha.com/siteverify',
      recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
    };

    this.config = {
      provider,
      secretKey,
      verifyUrl: verifyUrls[provider],
      siteKey,
    };
  }

  isEnabled(): boolean {
    return this.config.provider !== 'none';
  }

  getSiteKey(): string {
    return this.config.siteKey;
  }

  getProvider(): string {
    return this.config.provider;
  }

  /**
   * Verify a CAPTCHA token.
   * Returns success=true if CAPTCHA is disabled or verification passes.
   */
  async verify(token: string | undefined, clientIp: string): Promise<CaptchaVerificationResult> {
    if (!this.isEnabled()) {
      return { success: true };
    }

    if (!token) {
      return {
        success: false,
        errorCodes: ['missing-input-response'],
      };
    }

    if (!this.config.secretKey) {
      this.logger.warn('CAPTCHA secret key not configured', 'CaptchaService');
      return { success: false, errorCodes: ['configuration-error'] };
    }

    try {
      const formData = new FormData();
      formData.append('secret', this.config.secretKey);
      formData.append('response', token);
      formData.append('remoteip', clientIp);

      const response = await fetch(this.config.verifyUrl, {
        method: 'POST',
        body: formData,
      });

      const result = (await response.json()) as CaptchaVerificationResult;

      if (!result.success) {
        this.logger.warn(`CAPTCHA verification failed: ${result.errorCodes?.join(', ')}`, 'CaptchaService');
      }

      return result;
    } catch (error) {
      this.logger.error(`CAPTCHA verification error: ${error}`, 'CaptchaService');
      return { success: false, errorCodes: ['verification-error'] };
    }
  }

  /**
   * Determine if CAPTCHA should be required based on failed attempts.
   * Returns true if failedAttempts >= captchaThreshold (default: 3)
   */
  shouldRequireCaptcha(failedAttempts: number, captchaThreshold = 3): boolean {
    if (!this.isEnabled()) return false;
    return failedAttempts >= captchaThreshold;
  }
}