import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from, of, throwError } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';

import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import {
  buildCacheKey,
  readCacheOptions,
  readInvalidateTags,
  readWarmTags,
  resolveCacheKeyContext,
  tagIndexKey,
  type ResolvedCacheOptions,
} from '../decorators/cache.decorator.ts';
import {
  bumpTagGenerations,
  readTagGenerationSnapshot,
  readTagGenerations,
  tagGenerationsChanged,
  type TagGenerationSnapshot,
} from '../../modules/shared/cache/tag-generation.ts';
import { indexTagKey } from '../../modules/shared/cache/tag-index.ts';

export interface CacheMetricsSnapshot {
  readonly hits: number;
  readonly misses: number;
  readonly errors: number;
  readonly writes: number;
  readonly invalidations: number;
  readonly hitRate: number;
}

@Injectable()
export class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private errors = 0;
  private writes = 0;
  private invalidations = 0;

  recordHit(): void {
    this.hits += 1;
  }

  recordMiss(): void {
    this.misses += 1;
  }

  recordError(): void {
    this.errors += 1;
  }

  recordWrite(): void {
    this.writes += 1;
  }

  recordInvalidation(count: number): void {
    this.invalidations += count;
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.errors = 0;
    this.writes = 0;
    this.invalidations = 0;
  }

  snapshot(): CacheMetricsSnapshot {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      writes: this.writes,
      invalidations: this.invalidations,
      hitRate: total === 0 ? 0 : Number(((this.hits / total) * 100).toFixed(2)),
    };
  }
}

function safeJsonParse(value: string): unknown {
  return JSON.parse(value) as unknown;
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly valkeyService: ValkeyService,
    private readonly winstonLogger: WinstonLoggerService,
    private readonly metrics: CacheMetrics,
  ) {}

  private logEvent(event: Record<string, unknown>): void {
    this.winstonLogger.info(JSON.stringify({ component: 'CacheInterceptor', ...event }), 'CacheInterceptor');
  }

  async invalidateTags(tags: readonly string[]): Promise<number> {
    let removed = 0;
    for (const tag of tags) {
      try {
        const indexKey = tagIndexKey(tag);
        const keys = await this.valkeyService.smembers(indexKey);
        if (keys.length > 0) {
          for (const key of keys) {
            await this.valkeyService.del(key);
            removed += 1;
          }
        }
        await this.valkeyService.del(indexKey);
        // Bump before returning: every writer that snapshotted this tag before the sweep must
        // be refused, otherwise a response loaded before the invalidation is written afterwards.
        await bumpTagGenerations(this.valkeyService, [tag]);
      } catch (error) {
        this.metrics.recordError();
        this.winstonLogger.error(
          `Cache invalidation failed for tag=${tag}: ${String(error)}`,
          undefined,
          'CacheInterceptor',
        );
      }
    }
    this.metrics.recordInvalidation(removed);
    this.logEvent({ event: 'invalidate', tags, removed });
    return removed;
  }

  /**
   * Persists the response, unless an invalidation landed while it was being produced.
   *
   * Still fire-and-forget on purpose: the write stays off the response path (no cache latency is
   * added to callers, and a slow or unreachable Valkey cannot stall a request). What makes it
   * safe is that `generations` was snapshotted *before* the handler ran, so a value that an
   * invalidation has already outlived is discarded instead of resurrecting the cache.
   */
  private storeWithTags(
    key: string,
    value: unknown,
    ttl: number,
    tags: readonly string[],
    generations: TagGenerationSnapshot,
  ): void {
    void (async (): Promise<void> => {
      try {
        if (
          generations !== null &&
          tags.length > 0 &&
          tagGenerationsChanged(generations, await readTagGenerations(this.valkeyService, tags))
        ) {
          this.winstonLogger.warn(
            JSON.stringify({ component: 'CacheInterceptor', event: 'discard-stale-write', key, tags }),
            'CacheInterceptor',
          );
          return;
        }
        await this.valkeyService.set(key, JSON.stringify(value), ttl);
        for (const tag of tags) {
          await indexTagKey(this.valkeyService, tag, key);
        }
        this.metrics.recordWrite();
        this.logEvent({ event: 'write', key, ttl, tags });
      } catch (error) {
        this.metrics.recordError();
        this.winstonLogger.error(`Cache write failed for key=${key}: ${String(error)}`, undefined, 'CacheInterceptor');
      }
    })();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const invalidateTags = readInvalidateTags(context);
    const warmTags = readWarmTags(context);
    const options = readCacheOptions(context);

    if (invalidateTags.length > 0) {
      return from(this.invalidateTags(invalidateTags)).pipe(
        switchMap((removed) =>
          next.handle().pipe(
            map((data: unknown) => {
              this.logEvent({ event: 'invalidate-then-execute', tags: invalidateTags, removed });
              return data;
            }),
          ),
        ),
        catchError((error: unknown) => {
          this.metrics.recordError();
          return throwError(() => error);
        }),
      );
    }

    if (!options) {
      return next.handle();
    }

    return this.cached(context, next, options, warmTags);
  }

  /**
   * Reads an entry, failing open.
   *
   * A cache that is unreachable must not fail the request it was meant to accelerate: the
   * interceptor is bound globally, so letting a Valkey read error escape would turn a cache
   * outage into a 500 for every `@Cacheable` route in the deployment (Principle #12). An
   * unreadable cache is treated exactly as a cold one.
   */
  private async readEntry(key: string): Promise<string | null> {
    try {
      return await this.valkeyService.get(key);
    } catch (error) {
      this.metrics.recordError();
      this.winstonLogger.error(`Cache read failed for key=${key}: ${String(error)}`, undefined, 'CacheInterceptor');
      return null;
    }
  }

  private cached(
    context: ExecutionContext,
    next: CallHandler,
    options: ResolvedCacheOptions,
    warmTags: readonly string[],
  ): Observable<unknown> {
    const key = buildCacheKey(options, resolveCacheKeyContext(context));

    return from(this.readEntry(key)).pipe(
      switchMap((cachedValue) => {
        if (cachedValue !== null) {
          this.logEvent({ event: 'hit', key, namespace: options.namespace });
          try {
            const parsed = safeJsonParse(cachedValue);
            this.metrics.recordHit();
            return of(parsed);
          } catch (error) {
            this.metrics.recordError();
            this.winstonLogger.warn(
              `Cache entry was not valid JSON, dropping key=${key}: ${String(error)}`,
              'CacheInterceptor',
            );
            void this.valkeyService.del(key);
            this.metrics.recordMiss();
            this.logEvent({ event: 'corrupt', key, namespace: options.namespace });
            return this.executeAndStore(key, next, options, warmTags);
          }
        }

        this.metrics.recordMiss();
        this.logEvent({ event: 'miss', key, namespace: options.namespace });
        return this.executeAndStore(key, next, options, warmTags);
      }),
    );
  }

  /**
   * Reads the generations of `tags` before the handler runs, or `null` when Valkey cannot answer.
   *
   * `null` means "unknown" and permits the write afterwards: refusing every write while the cache
   * is unreachable would disable the cache entirely, only more slowly. Failing open here is the
   * same decision the read path makes when it cannot reach Valkey (Principle #12).
   */
  private async tagGenerationSnapshot(tags: readonly string[]): Promise<TagGenerationSnapshot> {
    const snapshot = await readTagGenerationSnapshot(this.valkeyService, tags);
    if (snapshot === null) {
      this.metrics.recordError();
      this.winstonLogger.error(
        `Cache generation snapshot unavailable for tags=${tags.join(',')}`,
        undefined,
        'CacheInterceptor',
      );
    }
    return snapshot;
  }

  private executeAndStore(
    key: string,
    next: CallHandler,
    options: ResolvedCacheOptions,
    warmTags: readonly string[],
  ): Observable<unknown> {
    const tags = [...new Set([...options.tags, ...warmTags])];
    // Snapshot the tag generations BEFORE the handler runs: everything the handler is about to
    // read was still valid at this point, so an unchanged generation afterwards means nothing has
    // invalidated it. This is what turns the fire-and-forget write into a deterministic one.
    return from(this.tagGenerationSnapshot(tags)).pipe(
      switchMap((generations) =>
        next.handle().pipe(
          map((data: unknown) => {
            this.storeWithTags(key, data, options.ttl, tags, generations);
            return data;
          }),
          catchError((error: unknown) => {
            this.metrics.recordError();
            this.logEvent({ event: 'error', key, message: error instanceof Error ? error.message : String(error) });
            return throwError(() => error);
          }),
        ),
      ),
    );
  }
}
