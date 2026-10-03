import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Inject } from '@nestjs/common';

import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

/**
 * THE TWO VALUES THAT ACTUALLY RESTRICT AN ACCOUNT.
 *
 * `ModerationActionDto.action` is `'warn' | 'mute' | 'ban' | 'content_removal' | 'no_action'`, and
 * only two of those are restrictions. A `warn` is a note to the user, `content_removal` is a decision
 * about one piece of content, and `no_action` is the absence of a decision. Treating any of them as a
 * restriction would be a denial of service dressed as moderation.
 *
 * The set is closed on purpose and the fallthrough is deliberate: an unrecognised value is treated as
 * "not a restriction", so an action name added to the producer before it is added here fails OPEN
 * rather than locking every affected account out of the entire API. For a control whose worst error is
 * "a restricted user can still read", failing open is the correct direction; failing closed would mean
 * a typo in one file takes the product down for the people it is meant to protect.
 */
const FULLY_BLOCKED: ReadonlySet<string> = new Set(['ban']);
const WRITE_DENIED: ReadonlySet<string> = new Set(['mute']);

/** Methods that do not mutate. A muted account keeps full read access — that is what "mute" means. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * WHY THE KEY'S EXISTENCE IS NOT SUFFICIENT TRUSTWORTHILY ON ITS OWN.
 *
 * `ModerationEventHandler` writes `restriction:<userId>` for EVERY action, including `warn` and
 * `no_action` — so the key being present has never meant "restricted". The producer now writes only
 * for `ban` and `mute`, but a key written by an older build, or by any future producer that forgets
 * the rule, would still be present. So the guard checks the VALUE and not merely the key: an unknown
 * value is not a restriction. That makes the control's correctness depend on the value rather than on
 * an invariant a future change could quietly break.
 */
@Injectable()
export class RestrictionGuard implements CanActivate {
  constructor(
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest() as { user?: { sub?: string }; method?: string };
    const subject = request.user?.sub;

    // Runs second in `SECURED_GUARDS`, after `JwtAuthGuard` has populated `request.user`. No subject
    // here means the caller is not authenticated, which is `JwtAuthGuard`'s business to decide, not
    // this guard's — so it passes and lets the next guard answer.
    if (!subject) {
      return true;
    }

    const restrictionKey = `restriction:${subject}`;

    let hasRestriction: boolean;
    try {
      hasRestriction = await this.valkeyService.exists(restrictionKey);
    } catch (error) {
      // WHY THIS FAILS OPEN. `ValkeyService.exists` already returns false when its client is null, so
      // the ordinary "Valkey is not configured" case needs no handling here. This catch is for a
      // driver-level failure against a live connection — a timeout, a dropped socket — which would
      // otherwise reject and become a 500 on EVERY authenticated request in the product, because this
      // guard is composed into `@Secured`. The trade is deliberate: a cache outage means the
      // restriction is temporarily unenforced for the length of the outage, which is the same posture
      // the WAF IP blocklist takes, and strictly better than taking the API down. The ban itself is
      // still in `user_restrictions` and still blocks login, so the account is not simply let loose.
      this.logger.error(
        `Restriction lookup failed for ${restrictionKey}; failing open: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'RestrictionGuard',
      );
      return true;
    }

    if (!hasRestriction) {
      return true;
    }

    let restrictionType: string | null;
    try {
      restrictionType = await this.valkeyService.get(restrictionKey);
    } catch (error) {
      this.logger.error(
        `Restriction value read failed for ${restrictionKey}; failing open: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'RestrictionGuard',
      );
      return true;
    }

    if (restrictionType === null || restrictionType === undefined) {
      // The key exists but holds nothing readable. Treating that as "restricted" would let a stale or
      // evicted key deny service with no explanation.
      return true;
    }

    if (FULLY_BLOCKED.has(restrictionType)) {
      // 403, not 401: the token is valid and the account is authenticated. It is not permitted.
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Your account has been suspended. Contact support if you believe this is a mistake.',
          type: restrictionType,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (WRITE_DENIED.has(restrictionType) && !SAFE_METHODS.has(request.method ?? 'GET')) {
      // 423 Locked rather than 403: the resource exists, the caller may read it, and the account is
      // temporarily unable to change it. A 403 would claim a permission the user actually has, and
      // frontends treat 403 as "log in again".
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED,
          message: 'Your account is muted. You can read but not post until this is lifted.',
          type: restrictionType,
        },
        HttpStatus.LOCKED,
      );
    }

    // A read by a muted account, or any value that is not one of the two restrictions.
    return true;
  }
}
