import { isOneOf } from './common.js';
import type { NamedPaginated } from './common.js';

export const BOOK_STATUSES = ['draft', 'published', 'archived'] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const isBookStatus = (value: string): value is BookStatus => isOneOf(BOOK_STATUSES, value);

export type Book = {
  id: string;
  title: string;
  /**
   * The author's DISPLAY name — a human-readable string, NOT an identity. It cannot answer
   * "who owns this book", because a display name is neither unique nor equal to an account id:
   * the book page used to gate its owner controls on `author === currentUserId`, which compared a
   * display name to a user id and so never matched, leaving publish/archive/delete permanently
   * dead. Ownership is answered by `ownerId`; the display string is rendered verbatim.
   */
  author: string;
  /**
   * The id of the account that owns the book (its creator). This is the field the frontend's
   * ownership check compares against the signed-in user's id, because `author` is a display name
   * and cannot identify an owner (see above).
   *
   * WHY THIS IS NOW SURFACED. `toBookResponse` used to omit it on the grounds that an account id
   * is an internal authorization fact. That left the client with no id to compare and the owner
   * controls were keyed on the display name instead — dead for every caller. Surfacing the owner id
   * is not a new privilege: the same value is written server-side from the caller on create and is
   * the only column the write guards read, and the book already publishes the author's display
   * name. It is an empty string only if the row somehow carries no owner (migration 0028 made the
   * column NOT NULL, so in practice it is always a real account id); an empty owner matches no
   * signed-in user, so the controls stay hidden for such a row rather than appearing wrongly.
   */
  ownerId: string;
  description: string | null;
  coverImage: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  language: string | null;
  pageCount: number | null;
  fileUrl: string | null;
  fileType: string | null;
  price: number | null;
  isFree: boolean;
  status: string;
  categoryId: string | null;
  views: number;
  likes: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type BooksListResponse = NamedPaginated<'books', Book>;

export type BookRecord = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverImage: string | null;
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  language: string | null;
  pageCount: number | null;
  fileUrl: string | null;
  fileType: string | null;
  price: number | null;
  isFree: boolean;
  status: string;
  categoryId: string | null;
  viewCount: number;
  likeCount: number;
  downloadCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReadingProgress = {
  id: string;
  bookId: string;
  currentPage: number;
  totalPages: number | null;
  progressPercentage: number;
  lastReadAt: string;
  completedAt: string | null;
};

export type ReadingProgressListResponse = NamedPaginated<'progress', ReadingProgress>;

/**
 * The rental durations the product offers, in days. `RentalsService` validates against this and the
 * frontend offers exactly these, so the two cannot drift — the same list in two files is how a client
 * ends up requesting a duration the API rejects.
 */
export const RENTAL_DURATION_DAYS = [1, 3, 7, 14, 30, 90] as const;
export type RentalDurationDays = (typeof RENTAL_DURATION_DAYS)[number];

export const DEFAULT_RENTAL_DURATION_DAYS: RentalDurationDays = 14;

export const isRentalDurationDays = (value: number): value is RentalDurationDays =>
  (RENTAL_DURATION_DAYS as readonly number[]).includes(value);

/**
 * The currency rental and purchase charges are denominated in. Matches `books.price`'s unit:
 * an integer with no currency column, sent to Paymob in piastres.
 */
export const RENTAL_CURRENCY = 'EGP';

/**
 * The flat daily rental rate, in piastres (1 EGP = 100 piastres).
 *
 * WHY ONE RATE AND NOT A PER-DURATION PRICE TABLE. A table of six entries can disagree with itself if
 * one price is edited; a single rate times a length cannot. It is also the value the frontend needs to
 * show a quote before the reader commits, which is why it lives here rather than in the rentals module
 * (Principle #9: one authoritative source per fact — the price).
 *
 * WHY PIASTRES. `books.price` is an integer with no currency column and the payments module sends
 * amounts to Paymob in piastres, so matching that unit avoids a conversion on every path.
 */
export const RENTAL_PRICE_PER_DAY_PIASTERS = 1000;

/** The maximum times one rental may be extended. Enforced by `RentalsService.extendRental`. */
export const MAX_RENTAL_EXTENSIONS = 3;

/** Price for `days` at the flat daily rate. Exported so the quote and the charge cannot diverge. */
export function rentalPriceForDays(days: number): number {
  return RENTAL_PRICE_PER_DAY_PIASTERS * days;
}

/**
 * What a money path returns: everything the client needs to send the customer to the gateway.
 *
 * WHY THIS TYPE EXISTS RATHER THAN THE PAYMENTS MODULE'S `PaymobCheckoutResponse`. That one is the
 * gateway's answer — it carries `paymentKey`, which is only meaningful to a headless integration —
 * and `purchase` used to return the `payments` ROW instead, which is neither. The frontend's schema
 * asked for `paymobUrl`, Zod rejected the response, and the buy flow errored on every attempt and
 * never redirected anyone to Paymob.
 *
 * The field names are the frontend's, unchanged: `checkoutUrl` is what `paymobUrl` was reaching for.
 * One declaration, imported by both sides, is the only way the two can be checked against each other
 * (Principle #9).
 */
export interface BookCheckoutResponse {
  /** The `payments` row id. Quote it on a webhook reconciliation. */
  paymentId: string;
  /** Paymob's order id, for gateway-side lookup. */
  orderId: string;
  /** Where to send the customer. Load this in the iframe integration. */
  checkoutUrl: string;
  /** Paymob's hosted accept URL, for a redirect flow instead of the iframe. */
  acceptUrl: string;
  /** `'pending'` until the webhook confirms. */
  status: string;
}
