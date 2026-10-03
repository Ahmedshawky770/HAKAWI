import { describe, it, expect } from 'vitest';

import { CacheEntryCorruptError, isDateLike, reviveNullableDate, reviveRequiredDate } from './date-revival.ts';

const CREATED_AT = new Date('2024-01-01T00:00:00.000Z');

/** What `JSON.stringify`/`JSON.parse` actually does to a `Date`. */
const AS_JSON = JSON.stringify({ createdAt: CREATED_AT }) as string;

describe('cache date revival', () => {
  it('sees what the cache really returns: a Date does not survive a JSON round trip', () => {
    const roundTripped: unknown = JSON.parse(AS_JSON);

    expect(roundTripped).toEqual({ createdAt: '2024-01-01T00:00:00.000Z' });
    expect(roundTripped).not.toBeInstanceOf(Date);
  });

  describe('reviveRequiredDate', () => {
    it('turns an ISO string back into the Date the repository returned', () => {
      const revived = reviveRequiredDate('2024-01-01T00:00:00.000Z', 'createdAt');

      expect(revived).toBeInstanceOf(Date);
      expect(revived.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });

    it('accepts epoch milliseconds', () => {
      expect(reviveRequiredDate(CREATED_AT.getTime(), 'createdAt').toISOString()).toBe(CREATED_AT.toISOString());
    });

    it('passes a real Date through untouched', () => {
      expect(reviveRequiredDate(CREATED_AT, 'createdAt')).toBe(CREATED_AT);
    });

    it('reports a null as corrupt instead of silently returning one', () => {
      expect(() => reviveRequiredDate(null, 'createdAt')).toThrow(CacheEntryCorruptError);
      expect(() => reviveRequiredDate(undefined, 'createdAt')).toThrow(/"createdAt"/);
    });

    it('reports an unparseable string as corrupt', () => {
      expect(() => reviveRequiredDate('not a date', 'updatedAt')).toThrow(CacheEntryCorruptError);
    });

    it('reports a field of the wrong type as corrupt', () => {
      expect(() => reviveRequiredDate({ year: 2024 }, 'createdAt')).toThrow(/a object/);
      expect(() => reviveRequiredDate([], 'createdAt')).toThrow(/an array/);
    });

    it('reports an Invalid Date as corrupt rather than propagating it', () => {
      expect(() => reviveRequiredDate(new Date('nope'), 'createdAt')).toThrow(/an Invalid Date/);
    });
  });

  describe('reviveNullableDate', () => {
    it('keeps null and undefined as null', () => {
      expect(reviveNullableDate(null, 'deletedAt')).toBeNull();
      expect(reviveNullableDate(undefined, 'deletedAt')).toBeNull();
    });

    it('revives an ISO string', () => {
      expect(reviveNullableDate('2024-06-01T00:00:00.000Z', 'publishDate')?.toISOString()).toBe(
        '2024-06-01T00:00:00.000Z',
      );
    });

    it('still refuses a value it cannot revive', () => {
      expect(() => reviveNullableDate(true, 'publishDate')).toThrow(CacheEntryCorruptError);
    });

    it('names the offending field so the log points at the payload', () => {
      expect(() => reviveNullableDate('nope', 'publishDate')).toThrow(/field "publishDate"/);
    });
  });

  describe('isDateLike', () => {
    it('accepts the shapes a cache entry may legitimately hold', () => {
      expect(isDateLike(CREATED_AT)).toBe(true);
      expect(isDateLike('2024-01-01T00:00:00.000Z')).toBe(true);
      expect(isDateLike(1_704_067_200_000)).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isDateLike(null)).toBe(false);
      expect(isDateLike('nope')).toBe(false);
      expect(isDateLike({})).toBe(false);
      expect(isDateLike(new Date('nope'))).toBe(false);
    });
  });
});
