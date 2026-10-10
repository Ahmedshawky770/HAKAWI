import { isOneOf } from './common.js';
import type { Paginated } from './common.js';

export const LIBRARY_ITEM_STATUSES = ['owned', 'rented', 'reading', 'completed'] as const;
export type LibraryItemStatus = (typeof LIBRARY_ITEM_STATUSES)[number];

export const isLibraryItemStatus = (value: string): value is LibraryItemStatus => isOneOf(LIBRARY_ITEM_STATUSES, value);

export type LibraryItem = {
  id: string;
  userId: string;
  bookId: string;
  rentalId: string | null;
  status: LibraryItemStatus;
  addedAt: string;
  lastAccessedAt: string | null;
};

export type LibraryListResponse = Paginated<LibraryItem>;

export type LibraryCountResponse = {
  count: number;
};
