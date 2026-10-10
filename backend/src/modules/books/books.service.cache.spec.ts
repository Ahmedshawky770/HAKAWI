import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { CacheMetrics } from '../../common/interceptors/cache.interceptor.ts';
import { PaymentsService } from '../payments/payments.service.ts';
import { RentalsService } from '../rentals/rentals.service.ts';
import type { ILibraryRepository } from '../library/interfaces/library-repository.interface.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';

import type { Book } from './types.ts';
import { toBookResponse } from './types.ts';
import { BooksService, bookIsbnCacheKey } from './books.service.ts';

/**
 * A faithful stand-in for the Valkey commands the cache uses.
 *
 * Everything lives in one string map, exactly as it does in Valkey: `set` writes text, `get`
 * reads text, `incr` parses and rewrites text. That fidelity is the whole point of this spec —
 * a fake that returned the object it was handed would make every serialisation bug invisible,
 * and the serialisation is where the bug lived.
 */
class InMemoryValkey {
  readonly strings = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl !== undefined && ttl <= 0) {
      throw new Error('invalid TTL');
    }
    this.strings.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.strings.delete(key);
    this.sets.delete(key);
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.strings.get(key) ?? '0') + 1;
    this.strings.set(key, String(next));
    return next;
  }

  async sadd(key: string, member: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    const before = set.size;
    set.add(member);
    this.sets.set(key, set);
    return set.size === before ? 0 : 1;
  }

  async srem(key: string, member: string): Promise<number> {
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async expire(): Promise<void> {
    return undefined;
  }
}

function buildRow(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'The Book',
    // `author` is a display name; the ownership guards read `ownerId` (migration 0021). This suite's
    // caller is 'user-1', so the owner has to be that, not the author string.
    author: 'Ahmad Author',
    ownerId: 'user-1',
    description: null,
    coverImage: null,
    isbn: '9781234567890',
    publisher: null,
    publishDate: new Date('2024-01-01T00:00:00.000Z'),
    language: 'en',
    pageCount: 120,
    fileUrl: 'https://example.com/book.pdf',
    fileType: 'pdf',
    price: 100,
    isFree: false,
    status: 'draft',
    categoryId: null,
    viewCount: 7,
    likeCount: 0,
    downloadCount: 0,
    deletedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('BooksService against a real tagged cache (serialize → deserialize round trip)', () => {
  let valkey: InMemoryValkey;
  let cache: TaggedCacheService;
  let metrics: CacheMetrics;
  let repository: {
    findById: ReturnType<typeof vi.fn<(id: string) => Promise<Book | null>>>;
    findByIsbn: ReturnType<typeof vi.fn<(isbn: string) => Promise<Book | null>>>;
    update: ReturnType<typeof vi.fn<(id: string, data: { status?: string }) => Promise<Book>>>;
    incrementViewCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
    incrementDownloadCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  };
  let service: BooksService;

  beforeEach(() => {
    valkey = new InMemoryValkey();
    metrics = new CacheMetrics();
    const logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
    cache = new TaggedCacheService(
      valkey as unknown as ValkeyService,
      metrics,
      logger as unknown as WinstonLoggerService,
    );
    repository = {
      findById: vi.fn<(id: string) => Promise<Book | null>>(),
      findByIsbn: vi.fn<(isbn: string) => Promise<Book | null>>(),
      update: vi.fn<(id: string, data: { status?: string }) => Promise<Book>>(),
      incrementViewCount: vi.fn<(id: string) => Promise<void>>(),
      incrementDownloadCount: vi.fn<(id: string) => Promise<void>>(),
    };
    service = new BooksService(
      repository as never,
      logger as unknown as WinstonLoggerService,
      cache,
      { emit: vi.fn() } as unknown as EventValidatorService,
      {} as PaymentsService,
      {} as RentalsService,
      // The library is the authoritative record of what a reader already owns, so `purchase`
      // reads it before initialising a payment.
      { findByUserAndBook: vi.fn().mockResolvedValue(null) } as unknown as ILibraryRepository,
    );
  });

  it('serves the same response on a cache hit as on a cache miss', async () => {
    repository.findById.mockResolvedValue(buildRow());

    const cold = await service.findById('book-1');
    const warm = await service.findById('book-1');

    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(warm).toEqual(cold);
    // The exact call `GET /books/:id` makes before the controller formats the response.
    expect(() => toBookResponse(warm)).not.toThrow();
    expect(toBookResponse(warm)).toEqual(toBookResponse(cold));
    expect(metrics.snapshot()).toMatchObject({ hits: 1, misses: 1 });
  });

  it('really does persist dates as strings, which is what used to break the hit', async () => {
    repository.findById.mockResolvedValue(buildRow());

    await service.findById('book-1');
    const persisted = JSON.parse(valkey.strings.get('cache:book:book-1') ?? 'null') as { createdAt: unknown };

    expect(typeof persisted.createdAt).toBe('string');
  });

  it('returns real Date instances from a cache hit', async () => {
    repository.findById.mockResolvedValue(buildRow());

    await service.findById('book-1');
    const warm = await service.findById('book-1');

    expect(warm.createdAt).toBeInstanceOf(Date);
    expect(warm.updatedAt).toBeInstanceOf(Date);
    expect(warm.publishDate).toBeInstanceOf(Date);
    expect(warm.deletedAt).toBeNull();
    expect(warm.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('round-trips the ISBN lookup through the same cache', async () => {
    repository.findByIsbn.mockResolvedValue(buildRow());

    const cold = await service.findByIsbn('9781234567890');
    const warm = await service.findByIsbn('9781234567890');

    expect(repository.findByIsbn).toHaveBeenCalledTimes(1);
    expect(toBookResponse(warm)).toEqual(toBookResponse(cold));
    expect(valkey.strings.has(`cache:book:${bookIsbnCacheKey('9781234567890')}`)).toBe(true);
  });

  it('heals an entry it cannot revive instead of throwing', async () => {
    repository.findById.mockResolvedValue(buildRow());
    valkey.strings.set('cache:book:book-1', JSON.stringify({ id: 'book-1', createdAt: {} }));

    const recovered = await service.findById('book-1');

    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(toBookResponse(recovered).createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('drops both the id and the ISBN entry on update, so the two read paths cannot disagree', async () => {
    repository.findById.mockResolvedValue(buildRow());
    repository.findByIsbn.mockResolvedValue(buildRow());
    repository.update.mockResolvedValue(buildRow({ title: 'Renamed' }));
    await service.findById('book-1');
    await service.findByIsbn('9781234567890');

    await service.update('book-1', { title: 'Renamed' }, 'user-1');

    expect(valkey.strings.has('cache:book:book-1')).toBe(false);
    expect(valkey.strings.has('cache:book:isbn:9781234567890')).toBe(false);
  });

  it('drops the old ISBN entry when the ISBN itself is renamed', async () => {
    repository.findById.mockResolvedValue(buildRow());
    // The conflict check asks the repository whether the new ISBN is already taken.
    repository.findByIsbn.mockImplementation(async (isbn: string) => (isbn === '9781234567890' ? buildRow() : null));
    repository.update.mockResolvedValue(buildRow({ isbn: '9780000000000' }));
    await service.findByIsbn('9781234567890');

    await service.update('book-1', { isbn: '9780000000000' }, 'user-1');

    expect(valkey.strings.has('cache:book:isbn:9781234567890')).toBe(false);
    expect(valkey.strings.has('cache:book:isbn:9780000000000')).toBe(false);
  });

  it('does not evict an unrelated book when one book is viewed', async () => {
    repository.findById.mockImplementation(async (id: string) => buildRow({ id }));
    repository.incrementViewCount.mockResolvedValue(undefined);
    await service.findById('book-1');
    await service.findById('book-2');

    await service.incrementViewCount('book-1');

    expect(valkey.strings.has('cache:book:book-2')).toBe(true);
    await expect(service.findById('book-2')).resolves.toMatchObject({ id: 'book-2' });
    // The second read of book-2 came from the cache, not the database.
    expect(vi.mocked(repository.findById).mock.calls.filter(([id]) => id === 'book-2')).toHaveLength(1);
    expect(metrics.snapshot()).toMatchObject({ hits: 1, misses: 2 });
  });

  it('refreshes the view count a caller reads after the increment', async () => {
    let viewCount = 7;
    repository.findById.mockImplementation(async () => buildRow({ viewCount }));
    repository.incrementViewCount.mockImplementation(async () => {
      viewCount += 1;
    });
    await service.findById('book-1');

    await service.incrementViewCount('book-1');

    await expect(service.findById('book-1')).resolves.toMatchObject({ viewCount: 8 });
  });

  it('drops the cached copy of a book that has just been published', async () => {
    let status = 'draft';
    repository.findById.mockImplementation(async () => buildRow({ status, publishDate: null }));
    repository.update.mockImplementation(async () => {
      status = 'published';
      return buildRow({ status, publishDate: new Date('2024-03-01') });
    });
    await service.findById('book-1');

    await service.publish('book-1', 'user-1');

    await expect(service.findById('book-1')).resolves.toMatchObject({ status: 'published' });
  });

  it('indexes every book key under the books tag so a tag sweep can still reach them', async () => {
    repository.findById.mockResolvedValue(buildRow());

    await service.findById('book-1');

    expect(valkey.sets.get('cache:tag:books')?.has('cache:book:book-1')).toBe(true);
  });
});
