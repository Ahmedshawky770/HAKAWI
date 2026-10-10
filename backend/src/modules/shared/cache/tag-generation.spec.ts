import { describe, it, expect } from 'vitest';

import { tagGenerationKey } from '../../../common/decorators/cache.decorator.ts';

import {
  INITIAL_TAG_GENERATION,
  bumpTagGenerations,
  readTagGenerations,
  tagGenerationsChanged,
  type TagGenerationClient,
} from './tag-generation.ts';

/** The smallest honest Valkey stand-in for `GET`/`INCR` on a counter key. */
class CounterClient implements TagGenerationClient {
  readonly counters = new Map<string, number>();
  failOn = new Set<string>();

  async get(key: string): Promise<string | null> {
    if (this.failOn.has('get')) {
      throw new Error('get unavailable');
    }
    const value = this.counters.get(key);
    return value === undefined ? null : String(value);
  }

  async incr(key: string): Promise<number> {
    if (this.failOn.has('incr')) {
      throw new Error('incr unavailable');
    }
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
}

describe('tag generations', () => {
  it('reads an untouched tag as the initial generation', async () => {
    const client = new CounterClient();

    await expect(readTagGenerations(client, ['stories'])).resolves.toEqual([INITIAL_TAG_GENERATION]);
  });

  it('reads nothing at all when there are no tags, without touching Valkey', async () => {
    const client = new CounterClient();
    client.failOn.add('get');

    await expect(readTagGenerations(client, [])).resolves.toEqual([]);
  });

  it('bumps the generation of every tag it is given', async () => {
    const client = new CounterClient();

    await bumpTagGenerations(client, ['stories', 'books']);

    expect(client.counters.get(tagGenerationKey('stories'))).toBe(1);
    expect(client.counters.get(tagGenerationKey('books'))).toBe(1);
  });

  it('keeps bumping, so successive invalidations never look like the same one', async () => {
    const client = new CounterClient();

    await bumpTagGenerations(client, ['stories']);
    await bumpTagGenerations(client, ['stories']);

    expect(await readTagGenerations(client, ['stories'])).toEqual(['2']);
  });

  it('detects an invalidation that landed between the snapshot and the write', async () => {
    const client = new CounterClient();
    const before = await readTagGenerations(client, ['stories']);

    await bumpTagGenerations(client, ['stories']);
    const after = await readTagGenerations(client, ['stories']);

    expect(tagGenerationsChanged(before, after)).toBe(true);
  });

  it('reports no change when nothing was invalidated', async () => {
    const client = new CounterClient();
    const before = await readTagGenerations(client, ['stories', 'books']);

    expect(tagGenerationsChanged(before, await readTagGenerations(client, ['stories', 'books']))).toBe(false);
  });

  it('treats a change in any one tag as a change', async () => {
    expect(tagGenerationsChanged(['1', '4'], ['1', '5'])).toBe(true);
    expect(tagGenerationsChanged(['2', '4'], ['1', '5'])).toBe(true);
  });

  it('treats a different set of tags as a change rather than comparing by luck', () => {
    expect(tagGenerationsChanged(['1'], [])).toBe(true);
    expect(tagGenerationsChanged([], ['1'])).toBe(true);
  });

  it('reports no change for two empty snapshots, which is what fail-open relies on', () => {
    expect(tagGenerationsChanged([], [])).toBe(false);
  });

  it('keeps the generation counter out of the tag index namespace', () => {
    expect(tagGenerationKey('stories')).toBe('cache:taggen:stories');
  });
});
