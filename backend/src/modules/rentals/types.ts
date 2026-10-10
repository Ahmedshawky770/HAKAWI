import { reviveNullableDate, reviveRequiredDate } from '../shared/cache/date-revival.ts';

export type Rental = {
  id: string;
  userId: string;
  bookId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  extendedCount: number;
  maxExtensions: number;
  returnedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateRentalInput = {
  userId: string;
  bookId: string;
  durationDays: number;
};

export type CreateRentalRequest = {
  bookId: string;
  durationDays: number;
};

export type RentalExtension = {
  id: string;
  rentalId: string;
  previousEndDate: Date;
  newEndDate: Date;
  extensionDays: number;
  createdAt: Date;
};

export type RentalResponse = {
  id: string;
  userId: string;
  bookId: string;
  status: string;
  startDate: string;
  endDate: string;
  extendedCount: number;
  maxExtensions: number;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalExtensionResponse = {
  id: string;
  rentalId: string;
  previousEndDate: string;
  newEndDate: string;
  extensionDays: number;
  createdAt: string;
};

export type RentalsListResponse = {
  rentals: RentalResponse[];
  total: number;
  page: number;
  limit: number;
};

export type RentalStatus = 'active' | 'expired' | 'returned' | 'cancelled';

export const RENTAL_DURATION_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
] as const;

export type RentalDurationPreset = (typeof RENTAL_DURATION_PRESETS)[number]['days'];

/**
 * Restores the `Date` fields of a rental that came back from the cache.
 *
 * `toRentalResponse` calls `.toISOString()` on `startDate`, `endDate`, `createdAt` and
 * `updatedAt`; a value that has only survived `JSON.stringify` → `JSON.parse` hands it ISO
 * strings instead, and the request dies with `TypeError: ...toISOString is not a function` on
 * every cache hit while the first, cold read succeeds. The cached copy of an entity has to be
 * shape-identical to the repository row it was loaded from, or the two paths cannot be reasoned
 * about separately (Principle #9).
 *
 * The primitives are shared with every other cached entity
 * (`shared/cache/date-revival.ts`); which fields are dates — and whether they are nullable — is
 * rental knowledge, so the field list lives here (Principle #10). A value that cannot be revived
 * raises `CacheEntryCorruptError`, which `TaggedCacheService.get` turns into a dropped key and a
 * miss, so an un-revivable entry heals itself instead of becoming a 500.
 */
export function reviveRentalDates(rental: Rental): Rental {
  return {
    ...rental,
    startDate: reviveRequiredDate(rental.startDate, 'startDate'),
    endDate: reviveRequiredDate(rental.endDate, 'endDate'),
    returnedAt: reviveNullableDate(rental.returnedAt, 'returnedAt'),
    deletedAt: reviveNullableDate(rental.deletedAt, 'deletedAt'),
    createdAt: reviveRequiredDate(rental.createdAt, 'createdAt'),
    updatedAt: reviveRequiredDate(rental.updatedAt, 'updatedAt'),
  };
}
