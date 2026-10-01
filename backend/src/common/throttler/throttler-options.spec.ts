import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

import { THROTTLE_TIERS } from '../../config/throttle.config.ts';
import { THROTTLE_TIER_METADATA } from '../decorators/throttle-tier.decorator.ts';
import { AccountType } from '../constants/roles.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import {
  authenticatedSubjectOf,
  clientAddressOf,
  createThrottleTrackerResolver,
  createThrottlerOptions,
} from './throttler-options.ts';

/**
 * The exact shape `JwtAuthGuard` assigns at `request.user = payload`, from
 * `JwtPayload { sub; email; accountType; adminRole? }`. Using anything else here is how
 * the `user.id` bug stayed hidden: the real type has no `id`, so the old tracker could
 * never resolve and the spec that faked `{ id: 'user-1' }` proved nothing.
 */
const verifiedUser: JwtPayload = {
  sub: 'e2f0a5b6-6f2a-4d1e-9c3a-8b7d6e5f4a3b',
  email: 'user@example.com',
  accountType: AccountType.READER,
};

describe('authenticatedSubjectOf', () => {
  it('reads the real JWT subject claim', () => {
    expect(authenticatedSubjectOf({ user: verifiedUser })).toBe(verifiedUser.sub);
  });

  it('returns null for a payload carrying only the legacy id field', () => {
    // A payload shaped `{ id: 'user-1' }` is not a JwtPayload. If the tracker ever goes
    // back to reading `id`, this fails rather than silently degrading in production.
    expect(authenticatedSubjectOf({ user: { id: 'user-1' } })).toBeNull();
  });

  it.each([
    ['no user at all', {}],
    ['a null user', { user: null }],
    ['an empty subject', { user: { ...verifiedUser, sub: '' } }],
    ['a non-string subject', { user: { ...verifiedUser, sub: 42 } }],
    ['a non-object user', { user: 'user-1' }],
  ])('returns null for %s', (_label, request) => {
    expect(authenticatedSubjectOf(request)).toBeNull();
  });
});

describe('clientAddressOf', () => {
  it('ignores X-Forwarded-For unless proxies are trusted', () => {
    const request = { ip: '203.0.113.5', headers: { 'x-forwarded-for': '198.51.100.7' } };

    expect(clientAddressOf(request, false)).toBe('ip:203.0.113.5');
  });

  it('honours X-Forwarded-For when proxies are trusted', () => {
    const request = { ip: '203.0.113.5', headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } };

    expect(clientAddressOf(request, true)).toBe('ip:198.51.100.7');
  });

  it('falls back to the socket address when req.ip is missing', () => {
    expect(clientAddressOf({ headers: {}, socket: { remoteAddress: '10.0.0.4' } }, false)).toBe('ip:10.0.0.4');
  });

  it('returns a single shared sentinel when nothing identifies the caller', () => {
    expect(clientAddressOf({ headers: {} }, false)).toBe('ip:unknown');
    expect(clientAddressOf({ headers: null }, true)).toBe('ip:unknown');
  });
});

describe('createThrottleTrackerResolver', () => {
  it('keys a user tier on the verified subject', () => {
    const tracker = createThrottleTrackerResolver('user', false);

    expect(tracker({ user: verifiedUser, ip: '203.0.113.5', headers: {} })).toBe(`user:${verifiedUser.sub}`);
  });

  it('gives two callers behind one address separate buckets when both are authenticated', () => {
    const tracker = createThrottleTrackerResolver('user', false);
    const other: JwtPayload = { ...verifiedUser, sub: 'user-2' };

    expect(tracker({ user: verifiedUser, ip: '203.0.113.5', headers: {} })).not.toBe(
      tracker({ user: other, ip: '203.0.113.5', headers: {} }),
    );
  });

  it('documents the IP fallback honestly for an unauthenticated caller', () => {
    const tracker = createThrottleTrackerResolver('user', false);

    expect(tracker({ ip: '203.0.113.5', headers: {} })).toBe('ip:203.0.113.5');
  });

  it('never returns an undefined bucket for a malformed subject', () => {
    const tracker = createThrottleTrackerResolver('user', false);

    expect(tracker({ user: { sub: '' }, ip: '203.0.113.5', headers: {} })).toBe('ip:203.0.113.5');
    expect(tracker({ user: { id: 'user-1' }, ip: '203.0.113.5', headers: {} })).toBe('ip:203.0.113.5');
  });

  it('ignores a forged X-Forwarded-For unless proxies are trusted', () => {
    const withoutTrust = createThrottleTrackerResolver('ip', false);
    const withTrust = createThrottleTrackerResolver('ip', true);
    const request = { ip: '203.0.113.5', headers: { 'x-forwarded-for': '198.51.100.7' } };

    expect(withoutTrust(request)).toBe('ip:203.0.113.5');
    expect(withTrust(request)).toBe('ip:198.51.100.7');
  });
});

describe('createThrottlerOptions', () => {
  function contextFor(handler: () => void): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => class Undecorated {},
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({ header: vi.fn() }) }),
    } as unknown as ExecutionContext;
  }

  it('maps every documented field of the tier onto the library option shape', () => {
    const options = createThrottlerOptions(THROTTLE_TIERS.auth, false, new Reflector());

    expect(options).toMatchObject({
      name: 'auth',
      limit: 10,
      ttl: 60_000,
      blockDuration: 60_000,
      setHeaders: true,
    });
  });

  it('always carries a synchronous skipIf so the library cannot mis-read it as truthy', () => {
    const options = createThrottlerOptions(THROTTLE_TIERS.default, false, new Reflector());
    const skipIf = options.skipIf;
    if (skipIf === undefined) {
      throw new Error('createThrottlerOptions must always set skipIf');
    }

    expect(skipIf(contextFor(() => undefined))).toBe(false);
  });

  it('makes every tier but the effective one skip an undecorated route', () => {
    const reflector = new Reflector();
    const context = contextFor(() => undefined);
    const skips = Object.fromEntries(
      Object.values(THROTTLE_TIERS).map((tier) => {
        const options = createThrottlerOptions(tier, false, reflector);
        const skipIf = options.skipIf;
        if (skipIf === undefined) {
          throw new Error('createThrottlerOptions must always set skipIf');
        }
        return [tier.name, skipIf(context)];
      }),
    );

    expect(skips).toEqual({ default: false, auth: true, session: true, upload: true, search: true });
  });

  it('runs only the session tier on a route decorated with it', () => {
    const reflector = new Reflector();
    const handler = (): void => undefined;
    Reflect.defineMetadata(THROTTLE_TIER_METADATA, 'session', handler);
    const context = contextFor(handler);

    const skips = Object.fromEntries(
      Object.values(THROTTLE_TIERS).map((tier) => {
        const options = createThrottlerOptions(tier, false, reflector);
        const skipIf = options.skipIf;
        if (skipIf === undefined) {
          throw new Error('createThrottlerOptions must always set skipIf');
        }
        return [tier.name, skipIf(context)];
      }),
    );

    // Refresh is machine traffic and has its own loose tier, so it must not also be capped by the
    // human-login budget of the `auth` tier.
    expect(skips).toEqual({ default: true, auth: true, session: false, upload: true, search: true });
  });
});
