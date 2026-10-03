import { tagGenerationKey } from '../../../common/decorators/cache.decorator.ts';

/**
 * Tag generation tokens — Principle #9 ("caches are invalidated on updates") and #12
 * (no stale state surviving an update).
 *
 * ## The problem
 *
 * `CacheInterceptor` used to write the response with `void (async () => {...})()`: a
 * fire-and-forget promise. Cache-aside is read-then-later-write, so the write can land *after*
 * an unrelated request has already invalidated the key:
 *
 *   T0  request A misses, runs the handler, reads `viewCount = 4`
 *   T1  request B updates the row to `viewCount = 5` and invalidates the key  (nothing cached)
 *   T2  A's fire-and-forget write finally lands                          (4 is cached again)
 *
 * From T2 on, every read serves `4` until the TTL expires. The invalidation happened, the log
 * says it happened, and the stale value is still being served — the cache quietly contradicts the
 * database, which is precisely the failure Principle #9 exists to prevent. Nothing about this is
 * a timing accident you can reproduce on demand; it needs a deliberate interleaving.
 *
 * Awaiting the write alone does not fix it (request B's invalidate can still land between A's read
 * and A's write), and it moves cache latency onto the response path for every caller.
 *
 * ## The solution
 *
 * A monotonically increasing counter per tag: `cache:taggen:<tag>`.
 *
 *   - a reader snapshots the generation(s) of the tags it is about to cache under, BEFORE it
 *     loads the data;
 *   - an invalidation (`invalidateTags`, or `invalidateKey` with the key's tags) bumps every
 *     generation it touches;
 *   - the writer compares its snapshot with the current generation immediately before writing.
 *     Any change means an invalidation landed while the data was being loaded, so the value is
 *     already stale and the write is discarded.
 *
 * Ordering is then a property of the data, not of when the write happened to be scheduled: a
 * write that *started* before an invalidation can never *complete* after it. The write stays
 * fire-and-forget, so response latency is unchanged.
 *
 * ## Why these keys have no TTL
 *
 * A generation counter is state, not cached data, and it is deliberately persistent. If it
 * expired, it would restart at 0 and a snapshot of `0` taken before an invalidation would compare
 * equal to the `0` seen afterwards — reopening exactly the window this protocol closes. One
 * counter per tag is bounded by the number of tags, so it cannot grow.
 */

/** The minimal Valkey surface needed for the generation protocol. */
export interface TagGenerationClient {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
}

/** The generation each tag starts at before it has ever been invalidated. */
export const INITIAL_TAG_GENERATION = '0';

/**
 * The generation snapshot a write is guarded against, or `null` when it could not be taken.
 *
 * `null` means "unknown" and permits the write — the same fail-open decision as a cache miss,
 * because refusing every write while Valkey is unreachable would silently disable the cache
 * anyway, only slower (Principle #12).
 */
export type TagGenerationSnapshot = readonly string[] | null;

/**
 * Reads the generations of `tags`, or `null` when Valkey cannot answer.
 *
 * `[]` for an empty tag list means "nothing to guard", which is different from `null`
 * ("could not be checked"): the first permits the write, and so does the second, but only the
 * first is a statement about the cache rather than about its reachability.
 */
export async function readTagGenerationSnapshot(
  client: TagGenerationClient,
  tags: readonly string[],
): Promise<TagGenerationSnapshot> {
  if (tags.length === 0) {
    return [];
  }
  try {
    return await readTagGenerations(client, tags);
  } catch {
    return null;
  }
}

/**
 * Reads the current generation of every tag. An absent counter reads as `INITIAL_TAG_GENERATION`,
 * which keeps the common case (no invalidation yet, or Valkey unreachable and failing open)
 * a single extra GET rather than a failure.
 */
export async function readTagGenerations(
  client: TagGenerationClient,
  tags: readonly string[],
): Promise<readonly string[]> {
  const generations: string[] = [];
  for (const tag of tags) {
    generations.push((await client.get(tagGenerationKey(tag))) ?? INITIAL_TAG_GENERATION);
  }
  return generations;
}

/** Bumps the generation of every tag, marking everything cached under them as invalidated. */
export async function bumpTagGenerations(client: TagGenerationClient, tags: readonly string[]): Promise<void> {
  for (const tag of tags) {
    await client.incr(tagGenerationKey(tag));
  }
}

/**
 * True when an invalidation touched at least one of the tags between the snapshot and the write.
 * A length mismatch counts as changed, so a set of tags that shifted underneath us is treated as
 * invalidated rather than compared element-wise by luck.
 */
export function tagGenerationsChanged(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return before.some((generation, position) => generation !== after[position]);
}
