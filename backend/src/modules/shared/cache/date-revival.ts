/**
 * Cache date revival — Principle #9 (Single Source of Truth) and #10 (unified typing files).
 *
 * ## The problem
 *
 * `TaggedCacheService.set` persists a value with `JSON.stringify` and every read comes back
 * through `JSON.parse`. `JSON.stringify(new Date())` emits an ISO **string**, and `JSON.parse`
 * has no way to know the string used to be a `Date`. So a cache *hit* hands back a value that
 * is structurally different from the repository value the *same call* returns on a miss:
 *
 *   miss → `createdAt` is a `Date`      → `book.createdAt.toISOString()` → 200
 *   hit  → `createdAt` is an ISO string → `book.createdAt.toISOString()` → `TypeError` → 500
 *
 * Optional chaining does not save it: `?.` guards `null`/`undefined`, it does not add a method
 * to a `string`. The failure is also the worst kind to debug, because the endpoint works on the
 * first request of every cold key and fails on every warm one.
 *
 * ## The solution
 *
 * Every value that comes back out of Valkey is passed through a revival function that restores
 * its `Date` fields, so the cached path is shape-identical to the uncached path. This module owns
 * the *primitives*; each entity names its own fields in its own `types.ts`, because which fields
 * are dates — and whether they are nullable — is entity knowledge, not cache knowledge. That
 * split keeps the primitive shared (one tested implementation) without letting the cache decide
 * anything about an entity's schema.
 *
 * A value that cannot be revived raises `CacheEntryCorruptError`. `TaggedCacheService.get`
 * treats that exactly like unparseable JSON: it drops the key, records a miss and lets the caller
 * reload from the repository. A corrupt cache entry therefore heals itself instead of turning
 * into a 500 (Principle #12 — one broken thing must not cascade).
 */

/**
 * Raised when a cached field cannot be turned back into the shape the repository returns.
 * Named explicitly so callers can distinguish "this entry is unusable" from "Valkey is down".
 */
export class CacheEntryCorruptError extends Error {
  constructor(
    readonly field: string,
    readonly received: unknown,
  ) {
    super(`Cache entry field "${field}" cannot be revived as a date (received ${describe(received)})`);
    this.name = 'CacheEntryCorruptError';
  }
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'an Invalid Date' : 'a Date';
  }
  return `a ${typeof value}`;
}

function corrupt(field: string, value: unknown): never {
  throw new CacheEntryCorruptError(field, value);
}

function coerceDate(value: unknown, field: string): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? corrupt(field, value) : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const revived = new Date(value);
    return Number.isNaN(revived.getTime()) ? corrupt(field, value) : revived;
  }
  return corrupt(field, value);
}

/**
 * Revives a nullable timestamp such as `publishDate`, `deletedAt` or `publishedAt`.
 * A missing or null field stays null; anything else must be a `Date`, an ISO string or epoch
 * milliseconds, otherwise the entry is reported as corrupt.
 */
export function reviveNullableDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return coerceDate(value, field);
}

/**
 * Revives a non-nullable timestamp such as `createdAt` or `updatedAt`.
 * A null or missing value is corrupt rather than silently null: the repository type says the
 * column is populated, so a null here means the cached payload is not the object we cached.
 */
export function reviveRequiredDate(value: unknown, field: string): Date {
  if (value === null || value === undefined) {
    return corrupt(field, value);
  }
  return coerceDate(value, field);
}

/** True when `value` is something {@link reviveNullableDate} can turn back into a `Date`. */
export function isDateLike(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}
