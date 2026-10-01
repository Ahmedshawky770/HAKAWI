import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firstValueFrom, of, throwError, lastValueFrom, from, type Observable } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import {
  CACHE_INVALIDATE_TAGS_METADATA,
  CACHE_WARM_TAGS_METADATA,
  Cacheable,
  DEFAULT_CACHE_TTL_SECONDS,
  InvalidateCacheTags,
  WarmCacheTags,
  buildCacheKey,
  readCacheOptions,
  readInvalidateTags,
  readWarmTags,
  resolveCacheKeyContext,
  resolveCacheOptions,
  tagIndexKey,
} from '../decorators/cache.decorator.ts';
import { TAG_INDEX_TTL_SECONDS } from '../../modules/shared/cache/tag-index.ts';

import { CacheInterceptor, CacheMetrics } from './cache.interceptor.ts';

/**
 * A faithful in-memory stand-in for the Valkey commands the cache actually uses.
 *
 * It stores *strings*, not objects, and it tracks set members and counters separately. That is
 * the point: a fake that handed back the object it was given would hide every serialisation bug
 * the real cache has (a `Date` that only survives as an ISO string, for instance).
 */
class FakeValkey {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  counters = new Map<string, number>();
  expiries = new Map<string, number>();
  failOn = new Set<string>();

  private guard(op: string): void {
    if (this.failOn.has(op)) {
      throw new Error(`${op} unavailable`);
    }
  }

  async get(key: string): Promise<string | null> {
    this.guard('get');
    if (this.expiries.has(key)) {
      return this.strings.get(key) ?? null;
    }
    return this.strings.get(key) ?? this.counters.get(key)?.toString() ?? null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.guard('set');
    this.strings.set(key, value);
    if (ttl !== undefined && ttl <= 0) {
      throw new Error('invalid TTL');
    }
    if (ttl !== undefined) {
      this.expiries.set(key, ttl);
    }
  }

  async del(key: string): Promise<void> {
    this.guard('del');
    this.strings.delete(key);
    this.sets.delete(key);
    this.counters.delete(key);
    this.expiries.delete(key);
  }

  async incr(key: string): Promise<number> {
    this.guard('incr');
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async sadd(key: string, member: string): Promise<number> {
    this.guard('sadd');
    const set = this.sets.get(key) ?? new Set<string>();
    const before = set.size;
    set.add(member);
    this.sets.set(key, set);
    return set.size === before ? 0 : 1;
  }

  async smembers(key: string): Promise<string[]> {
    this.guard('smembers');
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async srem(key: string, member: string): Promise<number> {
    this.guard('srem');
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }

  async expire(key: string, ttl: number): Promise<void> {
    this.guard('expire');
    this.expiries.set(key, ttl);
  }
}

type MockLogger = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

class StoriesService {
  findOne(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'story-1' });
  }

  update(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'story-1' });
  }
}

Cacheable({ namespace: 'story', ttl: 300, tags: ['story'], keyParams: ['id'] })(
  StoriesService.prototype,
  'findOne',
  Object.getOwnPropertyDescriptor(StoriesService.prototype, 'findOne') ?? {},
);
InvalidateCacheTags(['story'])(
  StoriesService.prototype,
  'update',
  Object.getOwnPropertyDescriptor(StoriesService.prototype, 'update') ?? {},
);

/** The key `findOne` now builds for a request carrying `user-1` and the `story-1` route param. */
const STORY_ONE_KEY = 'cache:story:StoriesService.findOne:u:user-1:p:story-1';

function contextFor(handlerName: 'findOne' | 'update', overrides: Record<string, unknown> = {}): ExecutionContext {
  const handler = StoriesService.prototype[handlerName];
  return {
    getHandler: () => handler,
    getClass: () => StoriesService,
    switchToHttp: () => ({
      getRequest: () => ({ params: { id: 'story-1' }, user: { id: 'user-1' }, ...overrides }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function handlerOf<T>(value: Observable<T>): CallHandler {
  return { handle: () => value };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

/** A promise the test resolves by hand, so an interleaving is forced rather than waited for. */
function gate<T>(): { promise: Promise<T>; open: (value: T) => void } {
  let open: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function keyContextFor(
  options: ReturnType<typeof resolveCacheOptions>,
  context: {
    request?: Record<string, unknown>;
    params?: Record<string, string>;
    userId?: string | null;
    route?: string;
  },
): string {
  const resolved = options ?? { namespace: 'default', ttl: 0, tags: [], keyParams: [] };
  return buildCacheKey(resolved, {
    request: context.request ?? {},
    params: context.params ?? {},
    userId: context.userId ?? null,
    route: context.route ?? 'Handler.route',
  });
}

describe('CacheInterceptor', () => {
  let valkey: FakeValkey;
  let logger: MockLogger;
  let metrics: CacheMetrics;
  let interceptor: CacheInterceptor;

  beforeEach(() => {
    valkey = new FakeValkey();
    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
    metrics = new CacheMetrics();
    interceptor = new CacheInterceptor(
      valkey as unknown as ValkeyService,
      logger as unknown as WinstonLoggerService,
      metrics,
    );
  });

  describe('cache keys and metadata', () => {
    it('builds a namespaced key from the route, the user and the route params', () => {
      const context = contextFor('findOne');
      const options = readCacheOptions(context);

      expect(options).not.toBeNull();
      expect(
        buildCacheKey(options ?? resolveCacheOptions({}) ?? { namespace: '', ttl: 0, tags: [], keyParams: [] }, {
          request: {},
          params: { id: 'story-1' },
          userId: 'user-1',
          route: 'StoriesService.findOne',
        }),
      ).toBe(STORY_ONE_KEY);
    });

    it('honours a custom key builder', () => {
      const options = resolveCacheOptions({ namespace: 'search', key: (context) => `q:${context.userId ?? 'anon'}` });
      const key = buildCacheKey(options ?? { namespace: 'search', ttl: 1, tags: [], keyParams: [] }, {
        request: {},
        params: {},
        userId: 'user-7',
        route: 'SearchService.search',
      });

      expect(key).toBe('cache:search:q:user-7');
    });

    it('falls back to request query values for key params', () => {
      const options = resolveCacheOptions({ namespace: 'list', keyParams: ['page'] });
      const key = buildCacheKey(options ?? { namespace: 'list', ttl: 1, tags: [], keyParams: [] }, {
        request: { page: 2 },
        params: {},
        userId: null,
        route: 'ListController.list',
      });

      expect(key).toBe('cache:list:ListController.list:anon:p:2');
    });

    it('normalises tags', () => {
      expect(resolveCacheOptions({ tags: ['  story 1 ', ''] })?.tags).toEqual(['story 1']);
    });

    it('returns null for an undecorated handler', () => {
      class Plain {
        handler(): void {
          return undefined;
        }
      }
      const context = {
        getHandler: () => Plain.prototype.handler,
        getClass: () => Plain,
      } as unknown as ExecutionContext;

      expect(readCacheOptions(context)).toBeNull();
      expect(resolveCacheOptions(undefined)).toBeNull();
    });

    it('exposes a stable tag index key', () => {
      expect(tagIndexKey('story')).toBe('cache:tag:story');
    });

    it('reads invalidate and warm tags from the decorator', () => {
      const context = contextFor('update');
      expect(readInvalidateTags(context)).toEqual(['story']);

      class Warm {
        handler(): void {
          return undefined;
        }
      }
      WarmCacheTags(['story', 'user'])(
        Warm.prototype,
        'handler',
        Object.getOwnPropertyDescriptor(Warm.prototype, 'handler') ?? {},
      );
      expect(
        readWarmTags({ getHandler: () => Warm.prototype.handler, getClass: () => Warm } as unknown as ExecutionContext),
      ).toEqual(['story', 'user']);
    });

    it('uses distinct metadata keys for invalidation and warming', () => {
      expect(CACHE_INVALIDATE_TAGS_METADATA).not.toBe(CACHE_WARM_TAGS_METADATA);
    });

    it('reads the request dimensions the key is built from', () => {
      const context = contextFor('findOne', { query: { page: '3' } });

      expect(resolveCacheKeyContext(context)).toEqual({
        request: expect.any(Object) as unknown,
        params: { id: 'story-1' },
        userId: 'user-1',
        route: 'StoriesService.findOne',
      });
    });

    it('reads the user id from a numeric subject', () => {
      const context = contextFor('findOne', { user: { id: 42 } });

      expect(resolveCacheKeyContext(context).userId).toBe('42');
    });

    it('reports no user for an anonymous request', () => {
      const context = contextFor('findOne', { user: undefined, userId: undefined });

      expect(resolveCacheKeyContext(context).userId).toBeNull();
    });
  });

  /**
   * Bug: `@Cacheable({ namespace: 'feed' })` used to key every request onto
   * `cache:feed:default`, because the default `keyParams` is `[]` and the user and query were
   * never read. One user's response was served to every other user, with no error anywhere.
   * A cache that can do that is worse than no cache, so the default key now folds in every
   * dimension that can change the response.
   */
  describe('fail-safe default keys', () => {
    it('gives two different users two different keys', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { userId: 'user-1' })).not.toBe(keyContextFor(options, { userId: 'user-2' }));
    });

    it('gives two different query strings two different keys', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { request: { query: { page: '1' } } })).not.toBe(
        keyContextFor(options, { request: { query: { page: '2' } } }),
      );
    });

    it('gives two different routes in the same namespace two different keys', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { route: 'FeedController.mine' })).not.toBe(
        keyContextFor(options, { route: 'FeedController.saved' }),
      );
    });

    it('keys a misconfigured decorator — no key, no keyParams — per user and per query', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { userId: 'user-1', request: { query: { page: '1' } } })).toBe(
        `cache:feed:Handler.route:u:user-1:q:page=1`,
      );
    });

    it('never collapses two requests that differ into one shared key', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });
      const contexts = [
        { userId: 'user-1', request: { query: { page: '1' } } },
        { userId: 'user-2', request: { query: { page: '1' } } },
        { userId: 'user-1', request: { query: { page: '2' } } },
        { userId: 'user-1', request: { query: { page: '1', sort: 'new' } } },
        { userId: null, request: {} },
      ];

      const keys = contexts.map((context) => keyContextFor(options, context));

      expect(new Set(keys).size).toBe(contexts.length);
    });

    it('shares a key only when the user, query and key params are all equal', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { userId: 'user-1', request: { query: { page: '1', sort: 'new' } } })).toBe(
        keyContextFor(options, { userId: 'user-1', request: { query: { sort: 'new', page: '1' } } }),
      );
    });

    it('orders the query canonically so parameter order does not fork the key', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { request: { query: { b: '2', a: '1' } } })).toContain('q:a=1&b=2');
    });

    it('separates values that only differ by a key delimiter', () => {
      const options = resolveCacheOptions({ namespace: 'feed', keyParams: ['id'] });

      expect(keyContextFor(options, { params: { id: 'a:b' }, userId: 'c' })).not.toBe(
        keyContextFor(options, { params: { id: 'a' }, userId: 'b:c' }),
      );
    });

    it('separates requests that differ only by an array-valued query parameter', () => {
      const options = resolveCacheOptions({ namespace: 'feed' });

      expect(keyContextFor(options, { request: { query: { tags: ['a', 'b'] } } })).not.toBe(
        keyContextFor(options, { request: { query: { tags: ['a', 'c'] } } }),
      );
    });

    it("serves one user their own cached response and never another user's", async () => {
      await lastValueFrom(
        interceptor.intercept(contextFor('findOne', { user: { id: 'user-1' } }), handlerOf(of({ id: 'user-1' }))),
      );
      await flush();
      await lastValueFrom(
        interceptor.intercept(contextFor('findOne', { user: { id: 'user-2' } }), handlerOf(of({ id: 'user-2' }))),
      );
      await flush();

      const forUserOne = await lastValueFrom(
        interceptor.intercept(contextFor('findOne', { user: { id: 'user-1' } }), handlerOf(of({ id: 'user-1' }))),
      );
      const forUserTwo = await lastValueFrom(
        interceptor.intercept(contextFor('findOne', { user: { id: 'user-2' } }), handlerOf(of({ id: 'user-2' }))),
      );

      expect(forUserOne).toEqual({ id: 'user-1' });
      expect(forUserTwo).toEqual({ id: 'user-2' });
      expect(metrics.snapshot()).toMatchObject({ hits: 2, misses: 2 });
    });
  });

  describe('pass-through', () => {
    it('executes the handler without touching Valkey when the route is not cacheable', async () => {
      class Plain {
        handler(): void {
          return undefined;
        }
      }
      const context = {
        getHandler: () => Plain.prototype.handler,
        getClass: () => Plain,
        switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
      } as unknown as ExecutionContext;

      const result = await lastValueFrom(interceptor.intercept(context, handlerOf(of('fresh'))));
      expect(result).toBe('fresh');
      expect(valkey.strings.size).toBe(0);
    });
  });

  describe('hit and miss', () => {
    it('serves a cached value without calling the handler', async () => {
      await valkey.set(STORY_ONE_KEY, JSON.stringify({ id: 'cached' }));
      const next = vi.fn().mockReturnValue(of({ id: 'fresh' }));

      const result = await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'fresh' }))));

      expect(result).toEqual({ id: 'cached' });
      expect(next).not.toHaveBeenCalled();
      expect(metrics.snapshot()).toMatchObject({ hits: 1, misses: 0, hitRate: 100 });
    });

    it('executes the handler and stores the value on a miss', async () => {
      const result = await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'fresh' }))));
      await flush();

      expect(result).toEqual({ id: 'fresh' });
      expect(valkey.strings.get(STORY_ONE_KEY)).toBe(JSON.stringify({ id: 'fresh' }));
      expect(metrics.snapshot()).toMatchObject({ hits: 0, misses: 1, writes: 1, hitRate: 0 });
    });

    it('tracks a mixed hit rate', async () => {
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'a' }))));
      await flush();
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'b' }))));

      expect(metrics.snapshot()).toMatchObject({ hits: 1, misses: 1, hitRate: 50 });
    });

    it('emits a structured log line for every hit and miss', async () => {
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'a' }))));
      await flush();
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'b' }))));

      const events = logger.info.mock.calls.map((call) => JSON.parse(String(call[0])) as { event: string });
      expect(events.map((event) => event.event)).toEqual(['miss', 'write', 'hit']);
      expect(events[2]).toMatchObject({ component: 'CacheInterceptor', key: STORY_ONE_KEY });
    });

    it('treats a corrupt cache entry as a miss and deletes it', async () => {
      await valkey.set(STORY_ONE_KEY, 'not json');
      const execute = vi.fn().mockReturnValue(of({ id: 'fresh' }));

      const result = await lastValueFrom(
        interceptor.intercept(contextFor('findOne'), { handle: execute } as CallHandler),
      );
      await flush();

      expect(result).toEqual({ id: 'fresh' });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(valkey.strings.get(STORY_ONE_KEY)).toBe(JSON.stringify({ id: 'fresh' }));
      expect(metrics.snapshot()).toMatchObject({ hits: 0, misses: 1, errors: 1 });
    });

    it('counts an error when the handler fails', async () => {
      await expect(
        firstValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(throwError(() => new Error('boom'))))),
      ).rejects.toThrow('boom');
      expect(metrics.snapshot().errors).toBe(1);
    });
  });

  describe('tag indexing and invalidation', () => {
    it('registers the cache key under each configured tag', async () => {
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'fresh' }))));
      await flush();

      expect(valkey.sets.get(tagIndexKey('story'))?.has(STORY_ONE_KEY)).toBe(true);
    });

    it('drops the entry and the index when a tag is invalidated', async () => {
      await valkey.set(STORY_ONE_KEY, JSON.stringify({ id: 'cached' }));
      await valkey.sadd(tagIndexKey('story'), STORY_ONE_KEY);

      const result = await lastValueFrom(interceptor.intercept(contextFor('update'), handlerOf(of({ id: 'new' }))));

      expect(result).toEqual({ id: 'new' });
      expect(valkey.strings.has(STORY_ONE_KEY)).toBe(false);
      expect(valkey.sets.has(tagIndexKey('story'))).toBe(false);
      expect(metrics.snapshot().invalidations).toBe(1);
    });

    it('invalidates every key registered under the tag', async () => {
      await valkey.set('cache:story:a', '1');
      await valkey.set('cache:story:b', '2');
      await valkey.sadd(tagIndexKey('story'), 'cache:story:a');
      await valkey.sadd(tagIndexKey('story'), 'cache:story:b');

      await lastValueFrom(interceptor.intercept(contextFor('update'), handlerOf(of({ id: 'new' }))));

      expect(valkey.strings.size).toBe(0);
      expect(metrics.snapshot().invalidations).toBe(2);
    });

    it('propagates a handler failure after invalidation', async () => {
      await expect(
        firstValueFrom(interceptor.intercept(contextFor('update'), handlerOf(throwError(() => new Error('boom'))))),
      ).rejects.toThrow('boom');
      expect(metrics.snapshot().errors).toBe(1);
    });

    it('keeps serving the handler when the store fails during invalidation', async () => {
      valkey.failOn.add('smembers');

      const result = await lastValueFrom(interceptor.intercept(contextFor('update'), handlerOf(of({ id: 'new' }))));

      expect(result).toEqual({ id: 'new' });
      expect(metrics.snapshot().errors).toBe(1);
    });
  });

  describe('cache warming', () => {
    it('adds the warmed tags to the stored entry', async () => {
      class Warmer {
        handler(): void {
          return undefined;
        }
      }
      Cacheable({ namespace: 'feed', ttl: 60, tags: ['feed'], keyParams: [] })(
        Warmer.prototype,
        'handler',
        Object.getOwnPropertyDescriptor(Warmer.prototype, 'handler') ?? {},
      );
      WarmCacheTags(['user'])(
        Warmer.prototype,
        'handler',
        Object.getOwnPropertyDescriptor(Warmer.prototype, 'handler') ?? {},
      );

      const context = {
        getHandler: () => Warmer.prototype.handler,
        getClass: () => Warmer,
        switchToHttp: () => ({ getRequest: () => ({ params: {} }), getResponse: () => ({}) }),
      } as unknown as ExecutionContext;

      await lastValueFrom(interceptor.intercept(context, handlerOf(of(['a', 'b']))));
      await flush();

      expect(valkey.sets.get(tagIndexKey('feed'))?.has('cache:feed:Warmer.handler:anon')).toBe(true);
      expect(valkey.sets.get(tagIndexKey('user'))?.has('cache:feed:Warmer.handler:anon')).toBe(true);
    });
  });

  /**
   * Bug: tag index sets were written with a bare `SADD` and no TTL. A set is only emptied by an
   * invalidation, so an index grew monotonically with the number of distinct keys ever cached
   * under its tag — in the one cached key with no expiry policy at all.
   */
  describe('tag index expiry', () => {
    it('gives the tag index a TTL when a key is indexed', async () => {
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'fresh' }))));
      await flush();

      expect(valkey.expiries.get(tagIndexKey('story'))).toBe(TAG_INDEX_TTL_SECONDS);
    });

    it('keeps the TTL above the longest entry TTL the index tracks', () => {
      expect(TAG_INDEX_TTL_SECONDS).toBeGreaterThan(DEFAULT_CACHE_TTL_SECONDS);
    });

    it('refreshes the index TTL on every write', async () => {
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'a' }))));
      await flush();
      valkey.expiries.delete(tagIndexKey('story'));

      await valkey.del(STORY_ONE_KEY);
      await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'b' }))));
      await flush();

      expect(valkey.expiries.get(tagIndexKey('story'))).toBe(TAG_INDEX_TTL_SECONDS);
    });

    it('still serves the handler when the index TTL cannot be set', async () => {
      valkey.failOn.add('expire');

      const result = await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'fresh' }))));
      await flush();

      expect(result).toEqual({ id: 'fresh' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  /**
   * Bug: `storeWithTags` was `void (async () => {...})()`. Cache-aside is read-then-later-write,
   * so the write could land after a concurrent invalidation and put the invalidated value back,
   * with the invalidation already reported as done. The interleaving below is forced with a gate,
   * not waited for, so the test is deterministic.
   */
  describe('write ordering around an invalidation', () => {
    it('discards a response whose tag was invalidated while it was being produced', async () => {
      const handler = gate<{ id: string }>();
      const served = firstValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(from(handler.promise))));

      // The request has snapshotted the generation and is now inside the handler.
      await flush();
      await interceptor.invalidateTags(['story']);
      handler.open({ id: 'stale' });

      await expect(served).resolves.toEqual({ id: 'stale' });
      await flush();

      expect(valkey.strings.has(STORY_ONE_KEY)).toBe(false);
      expect(valkey.sets.get(tagIndexKey('story'))?.has(STORY_ONE_KEY) ?? false).toBe(false);
      expect(metrics.snapshot().writes).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('discard-stale-write'), 'CacheInterceptor');
    });

    it('stores the response when no invalidation landed', async () => {
      const handler = gate<{ id: string }>();
      const served = firstValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(from(handler.promise))));

      await flush();
      handler.open({ id: 'fresh' });

      await expect(served).resolves.toEqual({ id: 'fresh' });
      await flush();

      expect(valkey.strings.get(STORY_ONE_KEY)).toBe(JSON.stringify({ id: 'fresh' }));
      expect(metrics.snapshot().writes).toBe(1);
    });

    it('still stores a response whose unrelated tag was invalidated', async () => {
      const handler = gate<{ id: string }>();
      const served = firstValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(from(handler.promise))));

      await flush();
      await interceptor.invalidateTags(['books']);
      handler.open({ id: 'fresh' });

      await expect(served).resolves.toEqual({ id: 'fresh' });
      await flush();

      expect(valkey.strings.get(STORY_ONE_KEY)).toBe(JSON.stringify({ id: 'fresh' }));
    });

    it('fails open and serves the handler when the cache cannot be read', async () => {
      valkey.failOn.add('get');

      const result = await lastValueFrom(interceptor.intercept(contextFor('findOne'), handlerOf(of({ id: 'fresh' }))));
      await flush();

      expect(result).toEqual({ id: 'fresh' });
      expect(valkey.strings.get(STORY_ONE_KEY)).toBe(JSON.stringify({ id: 'fresh' }));
      expect(metrics.snapshot()).toMatchObject({ misses: 1, writes: 1 });
    });
  });
});

describe('CacheMetrics', () => {
  it('starts empty with a zero hit rate', () => {
    const metrics = new CacheMetrics();
    expect(metrics.snapshot()).toEqual({
      hits: 0,
      misses: 0,
      errors: 0,
      writes: 0,
      invalidations: 0,
      hitRate: 0,
    });
  });

  it('computes a percentage hit rate', () => {
    const metrics = new CacheMetrics();
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();

    expect(metrics.snapshot().hitRate).toBe(66.67);
  });

  it('resets every counter', () => {
    const metrics = new CacheMetrics();
    metrics.recordHit();
    metrics.recordMiss();
    metrics.recordError();
    metrics.recordWrite();
    metrics.recordInvalidation(3);
    metrics.reset();

    expect(metrics.snapshot()).toEqual({ hits: 0, misses: 0, errors: 0, writes: 0, invalidations: 0, hitRate: 0 });
  });
});
