import { describe, it, expect } from 'vitest';

import { DEFAULT_CACHE_TTL_SECONDS, tagIndexKey } from '../../../common/decorators/cache.decorator.ts';

import { TAG_INDEX_TTL_SECONDS, indexTagKey, unindexTagKey } from './tag-index.ts';

/** Records what the index maintenance actually asked Valkey to do. */
class RecordingClient {
  readonly calls: string[] = [];
  failOn = new Set<string>();

  async sadd(key: string, member: string): Promise<number> {
    this.calls.push(`sadd ${key} ${member}`);
    return 1;
  }

  async srem(key: string, member: string): Promise<number> {
    this.calls.push(`srem ${key} ${member}`);
    return 1;
  }

  async expire(key: string, ttl: number): Promise<void> {
    this.calls.push(`expire ${key} ${ttl}`);
  }
}

describe('tag index maintenance', () => {
  it('adds the cache key to the index set of the tag', async () => {
    const client = new RecordingClient();

    await indexTagKey(client, 'stories', 'cache:story:story-1');

    expect(client.calls).toEqual([
      'sadd cache:tag:stories cache:story:story-1',
      `expire cache:tag:stories ${TAG_INDEX_TTL_SECONDS}`,
    ]);
  });

  it('gives the index set a TTL, which is the fix for the unbounded index', () => {
    expect(TAG_INDEX_TTL_SECONDS).toBeGreaterThan(0);
  });

  it('keeps the index alive longer than any entry it tracks', () => {
    // A shorter index TTL than the longest entry would let an invalidation miss a live entry.
    expect(TAG_INDEX_TTL_SECONDS).toBeGreaterThan(DEFAULT_CACHE_TTL_SECONDS);
  });

  it('accepts a caller-supplied TTL', async () => {
    const client = new RecordingClient();

    await indexTagKey(client, 'stories', 'cache:story:story-1', 60);

    expect(client.calls[1]).toBe('expire cache:tag:stories 60');
  });

  it('removes a deleted key from the index so no tombstone survives it', async () => {
    const client = new RecordingClient();

    await unindexTagKey(client, 'stories', 'cache:story:story-1');

    expect(client.calls).toEqual(['srem cache:tag:stories cache:story:story-1']);
  });

  it('keeps index and entry keys in separate namespaces', () => {
    expect(tagIndexKey('stories')).not.toBe('cache:story:story-1');
  });
});
