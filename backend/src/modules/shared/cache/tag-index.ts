import { tagIndexKey } from '../../../common/decorators/cache.decorator.ts';

/**
 * Tag index maintenance — Principle #11 ("TTL policies for all cached data").
 *
 * ## The problem
 *
 * Every tagged write did `SADD cache:tag:<tag> <cacheKey>` and nothing else. A set is only ever
 * emptied by an invalidation, so a tag that is written to but never invalidated — or whose keys
 * expire on their own TTL before any invalidation runs — accumulated members forever. The index
 * set then grew monotonically with the number of distinct keys ever cached under that tag, in a
 * key that had **no TTL at all**. The index was the one piece of cached state with no expiry
 * policy, and it was the piece that kept growing.
 *
 * ## The solution
 *
 * Two independent guarantees, both here so the interceptor and `TaggedCacheService` cannot drift:
 *
 * 1. Every index write refreshes a TTL on the index set. The index is bounded by the entry TTL it
 *    tracks plus {@link TAG_INDEX_TTL_SECONDS}, so an index whose keys all expired cannot outlive
 *    them by much and cannot accumulate dead members indefinitely.
 * 2. A targeted `invalidateKey` removes the key from the index it belonged to. Without this,
 *    targeted invalidation leaves a tombstone behind and the index only cleans up on the next
 *    full tag sweep — which is exactly what made the index grow in the first place.
 */

/**
 * How long a tag index set may live without being refreshed by a write.
 *
 * It MUST exceed the longest entry TTL the index tracks, otherwise the index can expire while a
 * still-live entry is untracked and a later invalidation silently misses it (a stale read, which
 * is worse than a cold read). The longest entry TTL in the codebase today is
 * `DEFAULT_CACHE_TTL_SECONDS = 3600`, so 24h leaves a 24x margin.
 */
export const TAG_INDEX_TTL_SECONDS = 86_400;

/** The minimal Valkey surface needed to keep a tag index consistent. */
export interface TagIndexClient {
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
}

/**
 * Records `cacheKey` under `tag` and gives the index set a TTL.
 *
 * The TTL is refreshed on every write, so a tag that is still being written never has its index
 * expire underneath it.
 */
export async function indexTagKey(
  client: TagIndexClient,
  tag: string,
  cacheKey: string,
  ttl: number = TAG_INDEX_TTL_SECONDS,
): Promise<void> {
  const indexKey = tagIndexKey(tag);
  await client.sadd(indexKey, cacheKey);
  await client.expire(indexKey, ttl);
}

/** Drops `cacheKey` from the index it was written to, so a dead key is not tracked as live. */
export async function unindexTagKey(client: TagIndexClient, tag: string, cacheKey: string): Promise<void> {
  await client.srem(tagIndexKey(tag), cacheKey);
}
