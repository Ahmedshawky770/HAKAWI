import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface.ts';
import { USERS_REPOSITORY } from '../users/interfaces/users-repository.interface.ts';

const VERIFICATION_TOKEN_PREFIX = 'email:verify:';
const VERIFICATION_TOKEN_TTL = 24 * 60 * 60;
const RESEND_COOLDOWN_PREFIX = 'email:resend:cooldown:';
const RESEND_COOLDOWN_TTL = 60;

@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async generateToken(email: string): Promise<string> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    await this.valkeyService.set(`${VERIFICATION_TOKEN_PREFIX}${token}`, user.id, VERIFICATION_TOKEN_TTL);
    await this.valkeyService.set(`${VERIFICATION_TOKEN_PREFIX}email:${email}`, token, VERIFICATION_TOKEN_TTL);
    return token;
  }

  async verifyToken(token: string): Promise<{ userId: string }> {
    const userId = await this.valkeyService.get(`${VERIFICATION_TOKEN_PREFIX}${token}`);
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersRepository.update(userId, { emailVerified: true, emailVerificationToken: null });
    await this.valkeyService.del(`${VERIFICATION_TOKEN_PREFIX}${token}`);
    await this.valkeyService.del(`${VERIFICATION_TOKEN_PREFIX}email:${user.email}`);

    await this.eventBus.emit('email.verified', { userId, email: user.email });
    return { userId };
  }

  async canResend(email: string): Promise<boolean> {
    const cooldown = await this.valkeyService.get(`${RESEND_COOLDOWN_PREFIX}${email}`);
    return !cooldown;
  }

  async resend(email: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const canResend = await this.canResend(email);
    if (!canResend) {
      throw new BadRequestException('Please wait before requesting another verification email');
    }

    await this.generateToken(email);
    await this.valkeyService.set(`${RESEND_COOLDOWN_PREFIX}${email}`, '1', RESEND_COOLDOWN_TTL);

    await this.eventBus.emit('email.verification.requested', { userId: user.id, email: user.email });
    return { message: 'Verification email sent' };
  }
}
