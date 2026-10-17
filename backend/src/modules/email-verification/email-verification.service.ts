import crypto from 'crypto';

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TransactionalEmailService } from '../../common/email/transactional-email.service.ts';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface.ts';
import { USERS_REPOSITORY } from '../users/interfaces/users-repository.interface.ts';

const VERIFICATION_TOKEN_PREFIX = 'email:verify:';
const VERIFICATION_TOKEN_TTL = 24 * 60 * 60;
const RESEND_COOLDOWN_PREFIX = 'email:resend:cooldown:';
const RESEND_COOLDOWN_TTL = 60;

/**
 * Six decimal digits — the whole space of the code, and the length the public contract declares.
 *
 * WHY THIS IS NOT WHAT WAS HERE. The service minted `crypto.randomInt(10000000, 100000000)`, which
 * is ALWAYS eight digits, while `VerifyEmailDto` declares `@Length(6, 6)`. `main.ts` installs a
 * global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`, so every minted token was
 * rejected by the pipe before `verifyToken` ever ran: the module could not verify anything, and the
 * module README's "6-digit verification token generation" described a value the code never produced.
 *
 * Fixed on the generator, not on the DTO. A six-digit code is what the README, the DTO and the user
 * expectation all say, and widening the DTO to eight would have made every code already in a user's
 * inbox unverifiable. The code is a one-time credential guarded by the 24-hour TTL and the 60-second
 * resend cooldown; its length is not the control that matters here, the TTL and the cooldown are.
 */
const VERIFICATION_TOKEN_LENGTH = 6;
const VERIFICATION_TOKEN_MIN = 10 ** (VERIFICATION_TOKEN_LENGTH - 1);
const VERIFICATION_TOKEN_MAX = 10 ** VERIFICATION_TOKEN_LENGTH;

/**
 * The message the resend endpoint returns when a mail really went out.
 *
 * The `resend` result used to be a constant `'Verification email sent'` regardless of what happened.
 * It is now derived from the delivery outcome: the endpoint still answers 200, because the token is
 * minted and stored either way and the request itself succeeded, but it no longer claims a mail it
 * did not send. The exact wording for each case is in the module README.
 */
const MESSAGE_SENT = 'Verification email sent';
const MESSAGE_NOT_SENT = 'Verification email could not be sent. Please try again later or contact support.';

@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    // The shared transport from `common/email/`, provided by `CommonModule`. Injected here rather
    // than reached for through `NotificationsModule`, which `dependency-rules.md` forbids.
    @Inject(TransactionalEmailService) private readonly emailSender: TransactionalEmailService,
  ) {}

  async generateToken(email: string): Promise<string> {
    const minted = await this.mintToken(email);
    return minted.token;
  }

  /**
   * The one place a code is minted, so the delivery cannot happen in one caller and be forgotten in
   * the other. Returns whether the mail actually went out, because `register` does not care and
   * `resend` has to answer truthfully about it.
   */
  private async mintToken(email: string): Promise<{ token: string; delivered: boolean }> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = crypto.randomInt(VERIFICATION_TOKEN_MIN, VERIFICATION_TOKEN_MAX).toString();
    await this.valkeyService.set(`${VERIFICATION_TOKEN_PREFIX}${token}`, user.id, VERIFICATION_TOKEN_TTL);
    await this.valkeyService.set(`${VERIFICATION_TOKEN_PREFIX}email:${email}`, token, VERIFICATION_TOKEN_TTL);

    // The mail is sent where the token is minted, and not through the event below. An event carries
    // no token — events are logged, parked in the DLQ and replayed, so a token on a payload is a
    // credential in three logs and a queue (Principle #15) — and no listener for this event exists
    // anywhere in the codebase, which is why registration and resend could never deliver a mail.
    const delivered = await this.sendVerificationEmail(user.email, token);

    return { token, delivered };
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

  async resend(email: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // WHY THE COOLDOWN IS ARMED BEFORE THE MINT. The old order — mint, send, then arm — let N
    // concurrent resends past the `canResend` read (the key is still absent for all of them), each
    // minting and delivering its own code, on a route that is `@Public()`. A read-then-write check
    // is not a check. `setIfAbsent` decides the race inside the store, so the first caller wins and
    // the rest are refused; the failure case the old ordering was protecting — a failed mint
    // locking the caller out for sixty seconds — is handled by clearing the key instead.
    const armed = await this.valkeyService.setIfAbsent(
      `${RESEND_COOLDOWN_PREFIX}${email}`,
      '1',
      RESEND_COOLDOWN_TTL,
    );
    if (!armed) {
      throw new BadRequestException('Please wait before requesting another verification email');
    }

    // `mintToken` mints the code, stores it and sends it. A failed mint must not leave the caller
    // locked out, so the cooldown is released when nothing went out.
    const minted = await this.mintToken(email);
    if (!minted.delivered) {
      await this.valkeyService.del(`${RESEND_COOLDOWN_PREFIX}${email}`);
    }

    await this.eventBus.emit('email.verification.requested', { userId: user.id, email: user.email });

    return {
      message: minted.delivered ? MESSAGE_SENT : MESSAGE_NOT_SENT,
    };
  }

  /**
   * Puts the six-digit code in front of the user.
   *
   * WHY IT NEVER THROWS. Sending is a side effect (Principle #14): the token is already minted and
   * stored by the time this runs, so an SMTP outage must not turn a successful registration into a
   * failed one, and must not turn a resend into a 500. The delivery outcome is returned to the caller
   * so its response can be truthful, and the reason is logged by `TransactionalEmailService`.
   *
   * WHY THE CODE IS NOT LOGGED HERE. Winston output is aggregated and retained, so a log line holding
   * a live verification code is a credential leak with a very long half-life. The sender logs the
   * recipient and the subject, which are both already present in the request, and never the body.
   */
  private async sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const outcome = await this.emailSender.send({
      to: email,
      subject: 'Verify your Hakawi email address',
      text: `Your Hakawi verification code is ${token}. It expires in 24 hours.`,
      html: `<p>Your Hakawi verification code is <strong>${token}</strong>. It expires in 24 hours.</p>`,
    });

    if (outcome.status !== 'sent') {
      // A registration or a resend that could not deliver. The token is still valid for 24 hours, so
      // the user can ask for another one; the failure is a delivery problem, not a lost code.
      this.logger.warn(
        `Verification email for ${email} was not delivered (${outcome.status}); the token remains valid`,
        'EmailVerificationService',
      );
      return false;
    }

    return true;
  }
}
