import { describe, it, expect, vi, type Mock } from 'vitest';

import { CacheMetrics } from '../../../common/interceptors/cache.interceptor.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

import { CacheEntryCorruptError } from './date-revival.ts';
import { TAG_INDEX_TTL_SECONDS } from './tag-index.ts';
import { TaggedCacheService } from './tagged-cache.service.ts';

type MockValkey = {
  get: Mock<(key: string) => Promise<string | null>>;
  set: Mock<(key: string, value: string, ttl?: number) => Promise<void>>;
  del: Mock<(key: string) => Promise<void>>;
  incr: Mock<(key: string) => Promise<number>>;
  sadd: Mock<(key: string, member: string) => Promise<number>>;
  srem: Mock<(key: string, member: string) => Promise<number>>;
  smembers: Mock<(key: string) => Promise<string[]>>;
  expire: Mock<(key: string, ttl: number) => Promise<void>>;
};

type MockLogger = { info: Mock; log: Mock; error: Mock; warn: Mock; debug: Mock; verbose: Mock };

type Harness = {
  cache: TaggedCacheService;
  valkey: MockValkey;
  metrics: CacheMetrics;
  logger: MockLogger;
};

function build(): Harness {
  const valkey: MockValkey = {
    get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
    set: vi.fn<(key: string, value: string, ttl?: number) => Promise<void>>().mockResolvedValue(undefined),
    del: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
    incr: vi.fn<(key: string) => Promise<number>>().mockResolvedValue(1),
    sadd: vi.fn<(key: string, member: string) => Promise<number>>().mockResolvedValue(1),
    srem: vi.fn<(key: string, member: string) => Promise<number>>().mockResolvedValue(1),
    smembers: vi.fn<(key: string) => Promise<string[]>>().mockResolvedValue([]),
    expire: vi.fn<(key: string, ttl: number) => Promise<void>>().mockResolvedValue(undefined),
  };
  const logger: MockLogger = {
    info: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  };
  const metrics = new CacheMetrics();
  const cache = new TaggedCacheService(
    valkey as unknown as ValkeyService,
    metrics,
    logger as unknown as WinstonLoggerService,
  );
  return { cache, valkey, metrics, logger };
}

describe('TaggedCacheService', () => {
  it('should namespace its keys the way the interceptor does', () => {
    const { cache } = build();

    expect(cache.buildKey('story', 'story-1')).toBe('cache:story:story-1');
  });

  describe('get', () => {
    it('should return the parsed entry and count a hit', async () => {
      const { cache, valkey, metrics } = build();
      vi.mocked(valkey.get).mockResolvedValue('{"id":"story-1"}');

      await expect(cache.get<{ id: string }>('story', 'story-1')).resolves.toEqual({ id: 'story-1' });
      expect(metrics.snapshot().hits).toBe(1);
    });

    it('should count a miss for an absent entry', async () => {
      const { cache, metrics } = build();

      await expect(cache.get('story', 'story-1')).resolves.toBeNull();
      expect(metrics.snapshot().misses).toBe(1);
    });

    it('should drop a corrupt entry and report a miss', async () => {
      const { cache, valkey, metrics, logger } = build();
      vi.mocked(valkey.get).mockResolvedValue('not json');

      await expect(cache.get('story', 'story-1')).resolves.toBeNull();
      expect(valkey.del).toHaveBeenCalledWith('cache:story:story-1');
      expect(metrics.snapshot().errors).toBe(1);
      expect(metrics.snapshot().misses).toBe(1);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should write the value and index it under every tag', async () => {
      const { cache, valkey, metrics } = build();

      await cache.set('story', 'story-1', { id: 'story-1' }, 600, ['stories']);

      expect(valkey.set).toHaveBeenCalledWith('cache:story:story-1', '{"id":"story-1"}', 600);
      expect(valkey.sadd).toHaveBeenCalledWith('cache:tag:stories', 'cache:story:story-1');
      expect(metrics.snapshot().writes).toBe(1);
    });

    it('should record an error and keep the caller alive when the write fails', async () => {
      const { cache, valkey, metrics, logger } = build();
      vi.mocked(valkey.set).mockRejectedValueOnce(new Error('connection terminated'));

      await expect(cache.set('story', 'story-1', { id: 'story-1' }, 600, ['stories'])).resolves.toBeUndefined();
      expect(metrics.snapshot().errors).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getOrSet', () => {
    it('should load and store on a miss', async () => {
      const { cache, valkey, metrics } = build();
      const load = vi.fn().mockResolvedValue({ id: 'story-1' });

      const entry = await cache.getOrSet({ namespace: 'story', key: 'story-1', ttl: 600, tags: ['stories'], load });

      expect(entry).toEqual({ value: { id: 'story-1' }, hit: false });
      expect(load).toHaveBeenCalledTimes(1);
      expect(valkey.set).toHaveBeenCalled();
      expect(metrics.snapshot().misses).toBe(1);
    });

    it('should serve the cached value without loading on a hit', async () => {
      const { cache, valkey } = build();
      vi.mocked(valkey.get).mockResolvedValue('{"id":"story-1"}');
      const load = vi.fn();

      const entry = await cache.getOrSet({ namespace: 'story', key: 'story-1', ttl: 600, tags: ['stories'], load });

      expect(entry).toEqual({ value: { id: 'story-1' }, hit: true });
      expect(load).not.toHaveBeenCalled();
    });

    it('should not cache a failed load', async () => {
      const { cache, valkey } = build();

      await expect(
        cache.getOrSet({
          namespace: 'story',
          key: 'story-9',
          ttl: 600,
          tags: ['stories'],
          load: () => Promise.reject(new Error('Story not found')),
        }),
      ).rejects.toThrow('Story not found');
      expect(valkey.set).not.toHaveBeenCalled();
    });
  });

  /**
   * Bug: `get` returned whatever `JSON.parse` produced, so a `Date` field came back as an ISO
   * string and the caller blew up on `.toISOString()` — but only on a hit, so the first (cold)
   * request of every key worked. `revive` is what makes the cached path shape-identical.
   */
  describe('revival on read', () => {
    type Cached = { id: string; createdAt: Date; deletedAt: Date | null };
    const revive = (value: Cached): Cached => ({ ...value, createdAt: new Date(value.createdAt) });

    it('should apply the revival to a cached value', async () => {
      const { cache, valkey } = build();
      vi.mocked(valkey.get).mockResolvedValue('{"id":"story-1","createdAt":"2024-01-01T00:00:00.000Z"}');
      const entry = await cache.getOrSet<Cached>({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        revive,
        load: () => Promise.reject(new Error('must not load')),
      });

      expect(entry.hit).toBe(true);
      expect(entry.value.createdAt).toBeInstanceOf(Date);
    });

    it('should return the same shape from the loader and from the cache', async () => {
      const { cache, valkey } = build();
      const loaderValue: Cached = { id: 'story-1', createdAt: new Date('2024-01-01'), deletedAt: null };

      const miss = await cache.getOrSet<Cached>({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        revive,
        load: () => Promise.resolve(loaderValue),
      });
      // What the loader returned is exactly what a real `JSON.stringify` would have persisted.
      vi.mocked(valkey.get).mockResolvedValue(JSON.stringify(miss.value));

      const hit = await cache.getOrSet<Cached>({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        revive,
        load: () => Promise.reject(new Error('must not load')),
      });

      expect(Object.keys(hit.value)).toEqual(Object.keys(loaderValue));
      expect(hit.value).toEqual(loaderValue);
    });

    it('should drop an entry whose revival fails and reload, rather than propagating', async () => {
      const { cache, valkey, metrics, logger } = build();
      vi.mocked(valkey.get).mockResolvedValue('{"id":"story-1","createdAt":{}}');
      const load = vi.fn().mockResolvedValue({ id: 'story-1', createdAt: new Date(), deletedAt: null });

      const entry = await cache.getOrSet<Cached>({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        revive: (value) => {
          if (Number.isNaN(new Date(value.createdAt).getTime())) {
            throw new CacheEntryCorruptError('createdAt', value.createdAt);
          }
          return revive(value);
        },
        load,
      });

      expect(entry.hit).toBe(false);
      expect(load).toHaveBeenCalledTimes(1);
      expect(valkey.del).toHaveBeenCalledWith('cache:story:story-1');
      expect(metrics.snapshot()).toMatchObject({ errors: 1, misses: 1 });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  /**
   * Bug: `set` wrote the index member and nothing else, and the write itself was unguarded
   * against an invalidation that landed while `load()` was running.
   */
  describe('write ordering and index maintenance', () => {
    it('should discard a write whose tag was invalidated while loading', async () => {
      const { cache, valkey, logger, metrics } = build();
      vi.mocked(valkey.get)
        .mockResolvedValueOnce(null) // cache read: miss
        .mockResolvedValueOnce('0') // generation snapshot before load
        .mockResolvedValueOnce('1'); // generation re-read before write: invalidated meanwhile

      const entry = await cache.getOrSet({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        load: () => Promise.resolve({ id: 'story-1' }),
      });

      expect(entry).toEqual({ value: { id: 'story-1' }, hit: false });
      expect(valkey.set).not.toHaveBeenCalled();
      expect(valkey.sadd).not.toHaveBeenCalled();
      expect(metrics.snapshot().writes).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should write when the generation has not moved', async () => {
      const { cache, valkey, metrics } = build();
      vi.mocked(valkey.get).mockResolvedValueOnce(null).mockResolvedValue('0');

      await cache.getOrSet({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        load: () => Promise.resolve({ id: 'story-1' }),
      });

      expect(valkey.set).toHaveBeenCalledWith('cache:story:story-1', '{"id":"story-1"}', 600);
      expect(metrics.snapshot().writes).toBe(1);
    });

    it('should write when the generation snapshot could not be taken', async () => {
      const { cache, valkey, metrics } = build();
      vi.mocked(valkey.get).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('get unavailable'));

      await cache.getOrSet({
        namespace: 'story',
        key: 'story-1',
        ttl: 600,
        tags: ['stories'],
        load: () => Promise.resolve({ id: 'story-1' }),
      });

      expect(valkey.set).toHaveBeenCalled();
      expect(metrics.snapshot()).toMatchObject({ errors: 1, writes: 1 });
    });

    it('should give the tag index set a TTL, which is what bounds its growth', async () => {
      const { cache, valkey } = build();

      await cache.set('story', 'story-1', { id: 'story-1' }, 600, ['stories']);

      expect(valkey.expire).toHaveBeenCalledWith('cache:tag:stories', TAG_INDEX_TTL_SECONDS);
    });

    it('should not snapshot generations for an untagged entry', async () => {
      const { cache, valkey } = build();

      await cache.set('story', 'story-1', { id: 'story-1' }, 600);

      expect(valkey.sadd).not.toHaveBeenCalled();
      expect(valkey.expire).not.toHaveBeenCalled();
    });
  });

  describe('invalidateTags', () => {
    it('should delete every key the tag index lists and drop the index', async () => {
      const { cache, valkey, metrics } = build();
      vi.mocked(valkey.smembers).mockResolvedValue(['cache:story:a', 'cache:story:b']);

      await expect(cache.invalidateTags(['stories'])).resolves.toBe(2);

      expect(valkey.del).toHaveBeenCalledWith('cache:story:a');
      expect(valkey.del).toHaveBeenCalledWith('cache:story:b');
      expect(valkey.del).toHaveBeenCalledWith('cache:tag:stories');
      expect(metrics.snapshot().invalidations).toBe(2);
    });

    it('should bump the tag generation so in-flight writers are refused', async () => {
      const { cache, valkey } = build();

      await cache.invalidateTags(['stories']);

      expect(valkey.incr).toHaveBeenCalledWith('cache:taggen:stories');
    });

    it('should keep invalidating the other tags when one fails', async () => {
      const { cache, valkey, metrics, logger } = build();
      vi.mocked(valkey.smembers)
        .mockRejectedValueOnce(new Error('connection terminated'))
        .mockResolvedValueOnce(['cache:book:a']);

      await expect(cache.invalidateTags(['stories', 'books'])).resolves.toBe(1);

      expect(metrics.snapshot().errors).toBe(1);
      expect(metrics.snapshot().invalidations).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateKey', () => {
    it('should delete the namespaced key', async () => {
      const { cache, valkey, metrics } = build();

      await cache.invalidateKey('story', 'story-1');

      expect(valkey.del).toHaveBeenCalledWith('cache:story:story-1');
      expect(metrics.snapshot().invalidations).toBe(1);
    });

    it('should unindex the key so the tag index keeps no tombstone', async () => {
      const { cache, valkey } = build();

      await cache.invalidateKey('story', 'story-1', ['stories']);

      expect(valkey.srem).toHaveBeenCalledWith('cache:tag:stories', 'cache:story:story-1');
    });

    it('should bump the generation of the tags it was given', async () => {
      const { cache, valkey } = build();

      await cache.invalidateKey('story', 'story-1', ['stories']);

      expect(valkey.incr).toHaveBeenCalledWith('cache:taggen:stories');
    });

    it('should leave other keys under the same tag cached', async () => {
      const { cache, valkey } = build();
      vi.mocked(valkey.smembers).mockResolvedValue(['cache:story:story-1', 'cache:story:story-2']);

      await cache.invalidateKey('story', 'story-1', ['stories']);

      expect(valkey.del).toHaveBeenCalledWith('cache:story:story-1');
      expect(valkey.del).not.toHaveBeenCalledWith('cache:story:story-2');
    });

    it('should still work for a caller that does not know its tags', async () => {
      const { cache, valkey } = build();

      await expect(cache.invalidateKey('story', 'story-1')).resolves.toBeUndefined();

      expect(valkey.del).toHaveBeenCalledWith('cache:story:story-1');
      expect(valkey.srem).not.toHaveBeenCalled();
      expect(valkey.incr).not.toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should feed the same counters the interceptor reports', async () => {
      const { cache, valkey, metrics } = build();

      await cache.set('story', 'a', { id: 'a' }, 60, ['stories']);
      vi.mocked(valkey.get).mockResolvedValue('{"id":"a"}');
      await cache.get('story', 'a');
      vi.mocked(valkey.get).mockResolvedValue(null);
      await cache.get('story', 'b');

      expect(metrics.snapshot()).toMatchObject({ hits: 1, misses: 1, writes: 1 });
    });
  });
});
