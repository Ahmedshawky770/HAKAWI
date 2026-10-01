import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';

import {
  buildThrottleConfig,
  FALLBACK_THROTTLE_TIER,
  THROTTLE_TIERS,
  THROTTLE_TIER_NAMES,
  isThrottleTierName,
} from '../../config/throttle.config.ts';
import { createThrottlerOptions } from '../throttler/throttler-options.ts';
import { AccountType } from '../constants/roles.ts';
import type { JwtPayload } from '../utils/jwt.util.ts';

import {
  THROTTLE_TIER_METADATA,
  ThrottleTier,
  buildThrottleTierSkipIf,
  buildThrottleTierSkipMap,
  isThrottleTierEnforced,
  readThrottleTier,
  resolveEffectiveThrottleTier,
} from './throttle-tier.decorator.ts';

class AuthController {
  @ThrottleTier('auth')
  login(): void {
    return undefined;
  }

  open(): void {
    return undefined;
  }
}

class UploadController {
  @ThrottleTier('upload')
  upload(): void {
    return undefined;
  }
}

class SearchController {
  @ThrottleTier('search')
  search(): void {
    return undefined;
  }
}

class DefaultController {
  @ThrottleTier('default')
  list(): void {
    return undefined;
  }
}

/** Stands in for a route on one of the ~20 controllers nobody decorated. */
class UndecoratedStoriesController {
  findAll(): void {
    return undefined;
  }
}

interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

class RecordingStorage implements ThrottlerStorage {
  readonly calls: string[] = [];
  readonly limitsByName = new Map<string, number>();
  hitsByName = new Map<string, number>();

  async increment(
    _key: string,
    _ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    this.calls.push(throttlerName);
    this.limitsByName.set(throttlerName, limit);
    const hits = (this.hitsByName.get(throttlerName) ?? 0) + 1;
    this.hitsByName.set(throttlerName, hits);
    return {
      totalHits: hits,
      timeToExpire: 60,
      isBlocked: hits > limit,
      timeToBlockExpire: 60,
    };
  }
}

/**
 * The REAL production wiring: the same `buildThrottleConfig` + `createThrottlerOptions`
 * that `CommonModule` wires, driven through the real `@nestjs/throttler` guard. A spec
 * that hand-builds its own throttler array can pass while production is broken, which is
 * exactly how the 5/min bug survived.
 */
async function productionGuardFor(storage: ThrottlerStorage, env: NodeJS.ProcessEnv = {}): Promise<ThrottlerGuard> {
  const { tiers, trustProxy } = buildThrottleConfig(env);
  const reflector = new Reflector();
  const guard = new ThrottlerGuard(
    { throttlers: Object.values(tiers).map((tier) => createThrottlerOptions(tier, trustProxy, reflector)) },
    storage,
    reflector,
  );
  await guard.onModuleInit();
  return guard;
}

/**
 * A REAL verified token payload, exactly the shape `JwtAuthGuard` assigns at
 * `request.user = payload`. The previous spec used `user: { id: 'user-1' }`, a field
 * that does not exist on `JwtPayload`, which is why the tracker bug was invisible here.
 */
const verifiedUser: JwtPayload = {
  sub: 'e2f0a5b6-6f2a-4d1e-9c3a-8b7d6e5f4a3b',
  email: 'user@example.com',
  accountType: AccountType.READER,
};

function contextFor(
  controller: object,
  handler: () => void,
  requestOverrides: Record<string, unknown> = {},
): ExecutionContext {
  const request: Record<string, unknown> = {
    ip: '203.0.113.5',
    user: verifiedUser,
    headers: {},
    ...requestOverrides,
  };
  const response: Record<string, unknown> = { header: vi.fn() };
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('ThrottleTier metadata', () => {
  const reflector = new Reflector();

  it('records the tier on the handler', () => {
    expect(reflector.get<string>(THROTTLE_TIER_METADATA, AuthController.prototype.login)).toBe('auth');
    expect(reflector.get<string>(THROTTLE_TIER_METADATA, UploadController.prototype.upload)).toBe('upload');
  });

  it('resolves the tier back to its documented configuration', () => {
    const tier = readThrottleTier(reflector, contextFor(AuthController, AuthController.prototype.login));

    expect(tier).toEqual(THROTTLE_TIERS.auth);
  });

  it('returns null for an undecorated handler', () => {
    expect(readThrottleTier(reflector, contextFor(AuthController, AuthController.prototype.open))).toBeNull();
  });

  it('returns null for an unknown tier name', () => {
    class Bogus {
      handler(): void {
        return undefined;
      }
    }
    Reflect.defineMetadata(THROTTLE_TIER_METADATA, 'not-a-tier', Bogus.prototype.handler);

    expect(readThrottleTier(reflector, contextFor(Bogus, Bogus.prototype.handler))).toBeNull();
  });
});

describe('resolveEffectiveThrottleTier', () => {
  const reflector = new Reflector();

  it('is the declared tier when the handler carries one', () => {
    expect(resolveEffectiveThrottleTier(reflector, contextFor(AuthController, AuthController.prototype.login))).toBe(
      'auth',
    );
  });

  it('falls back to the default tier for an undecorated handler', () => {
    expect(
      resolveEffectiveThrottleTier(
        reflector,
        contextFor(UndecoratedStoriesController, UndecoratedStoriesController.prototype.findAll),
      ),
    ).toBe(FALLBACK_THROTTLE_TIER);
  });

  it('uses the default tier as the declared fallback constant', () => {
    expect(FALLBACK_THROTTLE_TIER).toBe('default');
    expect(THROTTLE_TIERS[FALLBACK_THROTTLE_TIER].limit).toBe(30);
  });
});

describe('buildThrottleTierSkipIf', () => {
  const reflector = new Reflector();

  it.each([...THROTTLE_TIER_NAMES])('never enforces %s on an undecorated route', (tier) => {
    const skipIf = buildThrottleTierSkipIf(reflector, tier);
    const context = contextFor(UndecoratedStoriesController, UndecoratedStoriesController.prototype.findAll);

    expect(skipIf(context)).toBe(tier !== FALLBACK_THROTTLE_TIER);
  });

  it.each([...THROTTLE_TIER_NAMES])('never enforces %s on a route declared for another tier', (tier) => {
    const skipIf = buildThrottleTierSkipIf(reflector, tier);
    const context = contextFor(AuthController, AuthController.prototype.login);

    expect(skipIf(context)).toBe(tier !== 'auth');
  });

  it('returns a plain boolean, never a promise', () => {
    // `ThrottlerGuard.canActivate` calls `skipIf(context)` WITHOUT awaiting it, so a
    // promise-returning predicate would be truthy on every request and would silently
    // disable the tier it belongs to.
    const result = buildThrottleTierSkipIf(
      reflector,
      'auth',
    )(contextFor(AuthController, AuthController.prototype.login));

    expect(result).toBe(false);
    expect(typeof (result as unknown as { then?: unknown }).then).toBe('undefined');
  });
});

describe('buildThrottleTierSkipMap', () => {
  it('skips every tier except the selected one', () => {
    expect(buildThrottleTierSkipMap('auth')).toEqual({
      default: true,
      auth: false,
      session: true,
      upload: true,
      search: true,
    });
  });

  it('never skips the default tier when the default tier is selected', () => {
    expect(buildThrottleTierSkipMap('default')).toEqual({
      default: false,
      auth: true,
      session: true,
      upload: true,
      search: true,
    });
  });

  it('covers every declared tier name', () => {
    for (const tier of THROTTLE_TIER_NAMES) {
      expect(Object.keys(buildThrottleTierSkipMap(tier)).sort()).toEqual([...THROTTLE_TIER_NAMES].sort());
    }
  });
});

describe('isThrottleTierEnforced', () => {
  const reflector = new Reflector();

  it('is true only for the effective tier', () => {
    const context = contextFor(UploadController, UploadController.prototype.upload);

    expect(isThrottleTierEnforced(reflector, context, 'upload')).toBe(true);
    expect(isThrottleTierEnforced(reflector, context, 'auth')).toBe(false);
    expect(isThrottleTierEnforced(reflector, context, 'search')).toBe(false);
    expect(isThrottleTierEnforced(reflector, context, 'default')).toBe(false);
  });
});

describe('ThrottleTier against the real ThrottlerGuard with the real production wiring', () => {
  let storage: RecordingStorage;

  beforeEach(() => {
    storage = new RecordingStorage();
  });

  it.each([
    ['auth', AuthController, 'login'],
    ['upload', UploadController, 'upload'],
    ['search', SearchController, 'search'],
    ['default', DefaultController, 'list'],
  ] as const)('runs only the %s tier throttler', async (tier, controller, method) => {
    const prototype: object = controller.prototype;
    const handler: () => void = Reflect.get(prototype, method) as () => void;
    const guard = await productionGuardFor(storage);

    await expect(guard.canActivate(contextFor(controller.prototype, handler))).resolves.toBe(true);
    expect(storage.calls).toEqual([tier]);
  });

  it('runs ONLY the default tier on an undecorated controller, not the 5/min upload tier', async () => {
    const guard = await productionGuardFor(storage);

    await guard.canActivate(contextFor(UndecoratedStoriesController, UndecoratedStoriesController.prototype.findAll));

    expect(storage.calls).toEqual(['default']);
    expect(storage.calls).not.toContain('upload');
    expect(storage.limitsByName.get('default')).toBe(THROTTLE_TIERS.default.limit);
  });

  it('does not block an undecorated route after five requests, which is what the upload tier used to do', async () => {
    const guard = await productionGuardFor(storage);
    const context = contextFor(UndecoratedStoriesController, UndecoratedStoriesController.prototype.findAll);

    for (let index = 0; index < 20; index += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    expect(storage.calls).toHaveLength(20);
    expect(storage.hitsByName.get('default')).toBe(20);
    expect(storage.hitsByName.has('upload')).toBe(false);
  });

  it('applies the documented default limit to an undecorated route', async () => {
    const guard = await productionGuardFor(storage);
    const context = contextFor(UndecoratedStoriesController, UndecoratedStoriesController.prototype.findAll);

    for (let index = 0; index < THROTTLE_TIERS.default.limit; index += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    const failure = await guard.canActivate(context).catch((error: unknown) => error);
    expect((failure as { getStatus(): number }).getStatus()).toBe(429);
    expect(storage.hitsByName.get('default')).toBe(THROTTLE_TIERS.default.limit + 1);
  });

  it('still applies the documented 5/min upload limit to a route that declares it', async () => {
    const guard = await productionGuardFor(storage);
    const context = contextFor(UploadController, UploadController.prototype.upload);

    for (let index = 0; index < THROTTLE_TIERS.upload.limit; index += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    const failure = await guard.canActivate(context).catch((error: unknown) => error);

    expect((failure as { getStatus(): number }).getStatus()).toBe(429);
    expect(storage.calls.every((name) => name === 'upload')).toBe(true);
  });

  it('throws 429 once the auth tier limit is exceeded', async () => {
    const guard = await productionGuardFor(storage);
    const context = contextFor(AuthController, AuthController.prototype.login);

    for (let index = 0; index < THROTTLE_TIERS.auth.limit; index += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    const failure = await guard.canActivate(context).catch((error: unknown) => error);
    expect((failure as { getStatus(): number }).getStatus()).toBe(429);
    expect((failure as { message: string }).message).toContain('ThrottlerException');
  });

  it('sets the documented X-RateLimit headers with a per-tier suffix', async () => {
    const guard = await productionGuardFor(storage);
    const context = contextFor(AuthController, AuthController.prototype.login);

    await guard.canActivate(context);

    const response = context.switchToHttp().getResponse<{ header: ReturnType<typeof vi.fn> }>();
    const headerNames = response.header.mock.calls.map((call) => String(call[0]));
    expect(headerNames).toContain('X-RateLimit-Limit-auth');
    expect(headerNames).toContain('X-RateLimit-Remaining-auth');
    expect(headerNames).toContain('X-RateLimit-Reset-auth');
  });

  it('sets Retry-After when a request is throttled', async () => {
    const guard = await productionGuardFor(storage);
    const context = contextFor(AuthController, AuthController.prototype.login);

    for (let index = 0; index <= THROTTLE_TIERS.auth.limit; index += 1) {
      await guard.canActivate(context).catch(() => undefined);
    }

    const response = context.switchToHttp().getResponse<{ header: ReturnType<typeof vi.fn> }>();
    expect(response.header.mock.calls.map((call) => String(call[0]))).toContain('Retry-After-auth');
  });

  it('works with the stock in-memory storage the app ships as a fallback', async () => {
    const guard = await productionGuardFor(new ThrottlerStorageService());
    const context = contextFor(SearchController, SearchController.prototype.search);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('tier catalogue', () => {
  it('matches the documented limits', () => {
    expect(THROTTLE_TIERS.default).toMatchObject({ limit: 30, ttlMs: 60_000, tracker: 'user' });
    expect(THROTTLE_TIERS.auth).toMatchObject({ limit: 10, ttlMs: 60_000, tracker: 'ip' });
    expect(THROTTLE_TIERS.upload).toMatchObject({ limit: 5, ttlMs: 60_000, tracker: 'user' });
    expect(THROTTLE_TIERS.search).toMatchObject({ limit: 50, ttlMs: 60_000, tracker: 'user' });
  });

  it('gives every tier a documentation reference and a description', () => {
    for (const name of THROTTLE_TIER_NAMES) {
      expect(THROTTLE_TIERS[name].docRef).toMatch(/^docs\//);
      expect(THROTTLE_TIERS[name].description.length).toBeGreaterThan(0);
    }
  });

  it('recognises only declared tier names', () => {
    expect(isThrottleTierName('auth')).toBe(true);
    expect(isThrottleTierName('ADMIN')).toBe(false);
  });
});
