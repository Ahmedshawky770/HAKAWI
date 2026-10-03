import { Injectable, Inject } from '@nestjs/common';

import { tagIndexKey } from '../../../common/decorators/cache.decorator.ts';
import { CacheMetrics } from '../../../common/interceptors/cache.interceptor.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

import {
  bumpTagGenerations,
  readTagGenerationSnapshot,
  readTagGenerations,
  tagGenerationsChanged,
  type TagGenerationSnapshot,
} from './tag-generation.ts';
import { indexTagKey, unindexTagKey } from './tag-index.ts';

export interface TaggedCacheEntry<T> {
  readonly value: T;
  readonly hit: boolean;
}

export interface GetOrSetOptions<T> {
  readonly namespace: string;
  readonly key: string;
  readonly ttl: number;
  readonly tags: readonly string[];
  readonly load: () => Promise<T>;
  /**
   * Restores the shape the loader returns, applied to every value read back from Valkey.
   *
   * Required for any entity carrying `Date` fields: `JSON.stringify`/`JSON.parse` turn a `Date`
   * into an ISO string and cannot turn it back, so without this the cached path returns a
   * different object than the uncached path and any `.toISOString()` on it throws. The argument is
   * the JSON-decoded entry, typed as the entity so the function can rebuild it field by field; it
   * must throw rather than guess when it meets a shape it cannot restore. See
   * `./date-revival.ts` for the failure this prevents.
   *
   * A revival that throws is treated exactly like unparseable JSON: the entry is dropped and
   * reported as a miss, so a corrupt payload heals instead of turning into a 500.
   */
  readonly revive?: (value: T) => T;
}

/**
 * The service-level half of the tagged cache. `CacheInterceptor` is bound to the
 * HTTP execution context, so it can only wrap controller handlers; anything a
 * service caches for a non-HTTP caller (or for a second internal caller) has to
 * maintain the tag index and record the same metrics itself. It writes the exact
 * keys and the exact `cache:tag:*` index sets the interceptor writes, so the two
 * halves invalidate each other and `GET /api/v1/metrics/cache` stays honest.
 *
 * Three invariants it owns, each documented where it is implemented:
 * - **shape parity** — `revive` on {@link GetOrSetOptions} restores `Date` fields after a
 *   `JSON.parse`, so a hit returns the same object the loader returned (`date-revival.ts`);
 * - **bounded index** — every tag-index write carries a TTL, and a targeted `invalidateKey`
 *   unindexes the key it deletes (`tag-index.ts`);
 * - **deterministic ordering** — a write whose tags were invalidated while it was loading is
 *   discarded rather than written afterwards (`tag-generation.ts`).
 */
@Injectable()
export class TaggedCacheService {
  constructor(
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(CacheMetrics) private readonly metrics: CacheMetrics,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  buildKey(namespace: string, key: string): string {
    return `cache:${namespace}:${key}`;
  }

  async get<T>(namespace: string, key: string, revive?: (value: T) => T): Promise<T | null> {
    const cacheKey = this.buildKey(namespace, key);
    const cached = await this.valkeyService.get(cacheKey);
    if (cached === null) {
      this.metrics.recordMiss();
      return null;
    }
    try {
      // `JSON.parse` is `any` by declaration; the parse result is only ever handed to `revive`,
      // whose contract is to rebuild `T` from the decoded entry or reject it.
      const parsed = JSON.parse(cached) as T;
      const value = revive === undefined ? parsed : revive(parsed);
      this.metrics.recordHit();
      return value;
    } catch (error) {
      this.metrics.recordError();
      this.logger.warn(`Dropping corrupt cache entry ${cacheKey}: ${String(error)}`, 'TaggedCacheService');
      await this.valkeyService.del(cacheKey);
      this.metrics.recordMiss();
      return null;
    }
  }

  /**
   * Writes the value and indexes it under every tag.
   *
   * `expectedGenerations` is the snapshot taken before `load()` ran. When the tag generations have
   * moved since then, something invalidated this data while it was being read, so the write is
   * dropped: caching it would resurrect a value the invalidation was meant to remove
   * (Principle #9). Callers that pass no snapshot keep the plain write-through behaviour.
   */
  async set(
    namespace: string,
    key: string,
    value: unknown,
    ttl: number,
    tags: readonly string[] = [],
    expectedGenerations?: TagGenerationSnapshot,
  ): Promise<void> {
    const cacheKey = this.buildKey(namespace, key);
    try {
      if (expectedGenerations != null && tags.length > 0) {
        const current = await readTagGenerations(this.valkeyService, tags);
        if (tagGenerationsChanged(expectedGenerations, current)) {
          this.logger.warn(
            `Discarding stale cache write for ${cacheKey}: tags ${tags.join(',')} were invalidated while loading`,
            'TaggedCacheService',
          );
          return;
        }
      }
      await this.valkeyService.set(cacheKey, JSON.stringify(value), ttl);
      for (const tag of tags) {
        await indexTagKey(this.valkeyService, tag, cacheKey);
      }
      this.metrics.recordWrite();
    } catch (error) {
      this.metrics.recordError();
      this.logger.error(
        `Cache write failed for ${cacheKey}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'TaggedCacheService',
      );
    }
  }

  async getOrSet<T>(options: GetOrSetOptions<T>): Promise<TaggedCacheEntry<T>> {
    const cached = await this.get<T>(options.namespace, options.key, options.revive);
    if (cached !== null) {
      return { value: cached, hit: true };
    }
    // Snapshot before loading so the write below can tell whether an invalidation landed in
    // between. Fail-open: an unreachable Valkey yields `null`, which permits the write.
    const generations = await readTagGenerationSnapshot(this.valkeyService, options.tags);
    if (generations === null) {
      this.metrics.recordError();
      this.logger.error(
        `Cache generation snapshot unavailable for tags=${options.tags.join(',')}`,
        undefined,
        'TaggedCacheService',
      );
    }
    const loaded = await options.load();
    await this.set(options.namespace, options.key, loaded, options.ttl, options.tags, generations);
    return { value: loaded, hit: false };
  }

  async invalidateTags(tags: readonly string[]): Promise<number> {
    let removed = 0;
    for (const tag of tags) {
      const indexKey = tagIndexKey(tag);
      try {
        const keys = await this.valkeyService.smembers(indexKey);
        for (const key of keys) {
          await this.valkeyService.del(key);
          removed += 1;
        }
        await this.valkeyService.del(indexKey);
        // Bump the generation so a write that loaded its data before this sweep is refused
        // instead of landing afterwards and repopulating the cache with invalidated data.
        await bumpTagGenerations(this.valkeyService, [tag]);
      } catch (error) {
        this.metrics.recordError();
        this.logger.error(
          `Cache invalidation failed for tag=${tag}: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          'TaggedCacheService',
        );
      }
    }
    this.metrics.recordInvalidation(removed);
    return removed;
  }

  /**
   * Drops one key and removes it from the tag indexes it belongs to.
   *
   * Passing `tags` matters for more than tidiness: a key deleted without being unindexed leaves a
   * tombstone in its index set, so the set keeps growing and every later tag sweep pays for it.
   * The generation bump is what makes this targeted invalidation visible to in-flight readers,
   * which is what allows callers to use it *instead of* a tag-wide sweep (a targeted delete must
   * invalidate exactly as much as a sweep does, or it is not really an invalidation).
   */
  async invalidateKey(namespace: string, key: string, tags: readonly string[] = []): Promise<void> {
    const cacheKey = this.buildKey(namespace, key);
    await this.valkeyService.del(cacheKey);
    for (const tag of tags) {
      await unindexTagKey(this.valkeyService, tag, cacheKey);
    }
    if (tags.length > 0) {
      await bumpTagGenerations(this.valkeyService, tags);
    }
    this.metrics.recordInvalidation(1);
  }
}
