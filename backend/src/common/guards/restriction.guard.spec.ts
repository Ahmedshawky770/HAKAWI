import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, HttpStatus } from '@nestjs/common';

import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import { RestrictionGuard } from './restriction.guard.ts';

/**
 * The old spec asserted that a `mute` throws `ForbiddenException`, which is the tautology the guard
 * itself carried: `restrictionTypeStr === 'ban' ? 403 : 403`. Both branches were 403, so a mute and a
 * ban were indistinguishable, and a mute denied READS as well as writes — the opposite of what "mute"
 * means.
 *
 * It also passed no `method` on the request at all, so a read/write distinction could not have been
 * expressed. And the guard was applied to zero routes, so every case here was unit-testing a class
 * that guarded nothing: the tests could all be green while the control was entirely inert.
 *
 * Two things are pinned now. The status codes and the read/write split are this file's business. The
 * fact that the guard is REACHABLE AT ALL is pinned by `common.module.spec.ts`, which asserts the
 * provider and export, and by `secured.decorator.spec.ts`, which asserts the composition order.
 */
describe('RestrictionGuard', () => {
  let guard: RestrictionGuard;
  let mockValkeyService: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

  const contextFor = (subject: string | undefined, method = 'GET'): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: subject === undefined ? undefined : { sub: subject }, method }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    mockValkeyService = { exists: vi.fn(), get: vi.fn() };
    guard = new RestrictionGuard(
      mockValkeyService as unknown as ValkeyService,
      {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
      } as unknown as WinstonLoggerService,
    );
  });

  describe('an unrestricted account', () => {
    it('passes when no restriction key exists', async () => {
      mockValkeyService.exists.mockResolvedValue(false);

      await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true);
      expect(mockValkeyService.exists).toHaveBeenCalledWith('restriction:user-1');
    });

    it('does not read the value when the key is absent', async () => {
      mockValkeyService.exists.mockResolvedValue(false);

      await guard.canActivate(contextFor('user-1'));

      expect(mockValkeyService.get).not.toHaveBeenCalled();
    });
  });

  describe('an unauthenticated caller', () => {
    // `JwtAuthGuard` runs first in `SECURED_GUARDS` and decides authentication. If it passed, the
    // request is anonymous and this guard has nothing to decide.
    it('passes when there is no user at all', async () => {
      await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
      expect(mockValkeyService.exists).not.toHaveBeenCalled();
    });
  });

  describe('a banned account', () => {
    beforeEach(() => {
      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('ban');
    });

    it('is refused with 403 on a read', async () => {
      await expect(guard.canActivate(contextFor('user-1', 'GET'))).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('is refused with 403 on a write', async () => {
      await expect(guard.canActivate(contextFor('user-1', 'POST'))).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('is refused with 403 on a read-only method too, because a ban is total', async () => {
      await expect(guard.canActivate(contextFor('user-1', 'HEAD'))).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('carries the restriction type in the response body', async () => {
      await expect(guard.canActivate(contextFor('user-1'))).rejects.toMatchObject({
        response: expect.objectContaining({ type: 'ban' }),
      });
    });
  });

  describe('a muted account', () => {
    beforeEach(() => {
      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('mute');
    });

    it('may still read', async () => {
      await expect(guard.canActivate(contextFor('user-1', 'GET'))).resolves.toBe(true);
    });

    it('may still be probed with OPTIONS, which is how CORS preflight works', async () => {
      await expect(guard.canActivate(contextFor('user-1', 'OPTIONS'))).resolves.toBe(true);
    });

    it('may not write, and is told 423 rather than 403', async () => {
      // 403 would claim the user lacks a permission they have, and frontends treat 403 as "log in
      // again" — which is actively wrong for a muted account, since re-authenticating changes nothing.
      await expect(guard.canActivate(contextFor('user-1', 'POST'))).rejects.toMatchObject({
        status: HttpStatus.LOCKED,
      });
    });

    it('may not delete, patch or put either', async () => {
      for (const method of ['DELETE', 'PATCH', 'PUT']) {
        await expect(guard.canActivate(contextFor('user-1', method))).rejects.toMatchObject({
          status: HttpStatus.LOCKED,
        });
      }
    });
  });

  describe('values that are not restrictions', () => {
    // `ModerationEventHandler` used to write the RAW action for every one of the five, so
    // `restriction:<id>` could hold 'warn', 'content_removal' or 'no_action'. A guard that treated
    // any present key as a denial would have turned every warning into a total account lockout — which
    // is why the producer is now fixed too, and why the guard falls through rather than assuming.
    it('does not restrict a warned account', async () => {
      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('warn');

      await expect(guard.canActivate(contextFor('user-1', 'POST'))).resolves.toBe(true);
    });

    it('does not restrict an account whose content was merely removed', async () => {
      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('content_removal');

      await expect(guard.canActivate(contextFor('user-1', 'POST'))).resolves.toBe(true);
    });

    it('fails open on an unrecognised value', async () => {
      // Deliberate. An action name added to the producer before it reaches this set must not lock
      // every affected account out of the entire API; the wrong answer here is a total outage.
      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue('some_future_action');

      await expect(guard.canActivate(contextFor('user-1', 'POST'))).resolves.toBe(true);
    });

    it('fails open when the key exists but the value is unreadable', async () => {
      mockValkeyService.exists.mockResolvedValue(true);
      mockValkeyService.get.mockResolvedValue(null);

      await expect(guard.canActivate(contextFor('user-1', 'POST'))).resolves.toBe(true);
    });
  });

  describe('resilience', () => {
    it('fails open when Valkey is unavailable', async () => {
      // `ValkeyService.exists` returns false when its client is null, so an outage already fails open
      // at the service layer. A rejection here would be an unexpected driver failure, and denying
      // service to every authenticated caller because a cache is down is the wrong direction.
      mockValkeyService.exists.mockRejectedValue(new Error('Valkey down'));

      await expect(guard.canActivate(contextFor('user-1', 'POST'))).resolves.toBe(true);
    });
  });
});
