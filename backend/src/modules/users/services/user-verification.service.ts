import crypto from 'crypto';

import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IUsersRepository } from '../../../common/users/users-repository.interface.ts';
import { USERS_REPOSITORY } from '../../../common/users/users-repository.interface.ts';

export const USER_VERIFICATION_TOKEN_PREFIX = 'user:verify:';
export const USER_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
export const USER_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
export const USER_VERIFIED_AT_PREFIX = 'user:verified-at:';
export const USER_VERIFIED_AT_TTL_SECONDS = 365 * 24 * 60 * 60;

export const USER_VERIFICATION_TYPE = 'identity';

/**
 * Reads a token and deletes it in one server-side step.
 *
 * `GETDEL` semantics expressed as Lua so it holds on any Valkey/Redis the project supports.
 * A separate `GET` followed by `DEL` is two round trips and a race: two concurrent confirms
 * of the same leaked token would both read the user id and both flip `is_verified`. Inside
 * one script the read and the delete are a single atomic act, so exactly one caller can ever
 * win — which is what makes the token single-use rather than replayable for its whole TTL.
 */
const CONSUME_TOKEN_SCRIPT = [
  'local value = redis.call("GET", KEYS[1])',
  'if value then',
  'redis.call("DEL", KEYS[1])',
  'end',
  'return value',
].join('\n');

type IssueOutcome =
  | { readonly kind: 'already-verified' }
  | { readonly kind: 'cooldown' }
  | { readonly kind: 'issued'; readonly token: string };

/**
 * 429 for a token request inside the resend cooldown.
 *
 * Nest 12 ships no `TooManyRequestsException`, so the status is stated directly rather than
 * faked with a 400. The retry hint belongs in the response, which is what `Retry-After` on a
 * plain `HttpException` cannot express, so the seconds are in the message instead.
 */
export class VerificationCooldownException extends HttpException {
  constructor(cooldownSeconds: number) {
    super(
      `A verification token was already sent. Try again in ${cooldownSeconds} seconds.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface VerificationRequestResult {
  readonly userId: string;
  readonly alreadyVerified: boolean;
  readonly cooldownSeconds: number;
}

export interface VerificationStatus {
  readonly userId: string;
  readonly isVerified: boolean;
  readonly verifiedAt: string | null;
}

/**
 * Writes the `users.is_verified` column the DTOs and the public profile already
 * expose. The email-verification module only ever set `email_verified`, so nothing
 * in the codebase could turn the flag on; this service is the only writer.
 */
@Injectable()
export class UserVerificationService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async request(userId: string): Promise<VerificationRequestResult> {
    const outcome = await this.issue(userId);

    if (outcome.kind === 'already-verified') {
      return { userId, alreadyVerified: true, cooldownSeconds: 0 };
    }
    if (outcome.kind === 'cooldown') {
      return { userId, alreadyVerified: false, cooldownSeconds: USER_VERIFICATION_RESEND_COOLDOWN_SECONDS };
    }
    return { userId, alreadyVerified: false, cooldownSeconds: USER_VERIFICATION_RESEND_COOLDOWN_SECONDS };
  }

  /**
   * Issues a token for a caller that needs the token value rather than a result summary.
   *
   * This goes through the same `issue` path as `request`, so the resend cooldown applies to
   * both. It used to mint a token unconditionally, which made it an unauthenticated way
   * around the sixty-second cooldown `request` enforces.
   */
  async issueToken(userId: string): Promise<string> {
    const outcome = await this.issue(userId);

    if (outcome.kind === 'already-verified') {
      throw new BadRequestException('User is already verified');
    }
    if (outcome.kind === 'cooldown') {
      throw new VerificationCooldownException(USER_VERIFICATION_RESEND_COOLDOWN_SECONDS);
    }
    return outcome.token;
  }

  /**
   * The one place a token is minted, so the cooldown cannot be enforced in one caller and
   * forgotten in the other.
   */
  private async issue(userId: string): Promise<IssueOutcome> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      return { kind: 'already-verified' };
    }

    const cooldownKey = `${USER_VERIFICATION_TOKEN_PREFIX}cooldown:${userId}`;
    if (await this.valkeyService.get(cooldownKey)) {
      return { kind: 'cooldown' };
    }

    const token = crypto.randomBytes(24).toString('hex');
    await this.valkeyService.set(`${USER_VERIFICATION_TOKEN_PREFIX}${token}`, userId, USER_VERIFICATION_TTL_SECONDS);
    await this.valkeyService.set(cooldownKey, '1', USER_VERIFICATION_RESEND_COOLDOWN_SECONDS);

    await this.eventBus.emit('email.verification.requested', { userId, email: user.email });
    this.logger.info(`Verification token issued for user ${userId}`, 'UserVerificationService');

    return { kind: 'issued', token };
  }

  async confirm(token: string): Promise<VerificationStatus> {
    const userId = await this.consumeToken(token);
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    return this.markVerified(userId);
  }

  /**
   * Claims the token. Returns null when it was unknown, already claimed, or expired.
   *
   * The token is consumed before the user row is touched, so a confirm that fails later
   * cannot be retried with the same token. Losing the token on a failed confirm is the
   * price of not letting it be replayable for the remaining twenty-four hours.
   */
  private async consumeToken(token: string): Promise<string | null> {
    const result = await this.valkeyService.eval(CONSUME_TOKEN_SCRIPT, [`${USER_VERIFICATION_TOKEN_PREFIX}${token}`]);
    return typeof result === 'string' && result.length > 0 ? result : null;
  }

  async markVerified(userId: string): Promise<VerificationStatus> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const verifiedAt = new Date().toISOString();
    await this.usersRepository.update(userId, {
      isVerified: true,
      emailVerified: true,
      emailVerificationToken: null,
    });
    await this.valkeyService.del(`${USER_VERIFICATION_TOKEN_PREFIX}cooldown:${userId}`);
    await this.valkeyService.set(`${USER_VERIFIED_AT_PREFIX}${userId}`, verifiedAt, USER_VERIFIED_AT_TTL_SECONDS);

    await this.eventBus.emit('email.verified', { userId, email: user.email });

    this.logger.info(`User ${userId} marked as verified`, 'UserVerificationService');
    return { userId, isVerified: true, verifiedAt };
  }

  async status(userId: string): Promise<VerificationStatus> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return {
      userId,
      isVerified: user.isVerified === true,
      verifiedAt: await this.valkeyService.get(`${USER_VERIFIED_AT_PREFIX}${userId}`),
    };
  }
}
