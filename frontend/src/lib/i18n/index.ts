import type { Locale } from "@/lib/preferences";

import { AR as AR_SHELL, EN as EN_SHELL, type ShellStrings } from "./shell";
import { AR as AR_COMMON, EN as EN_COMMON, type CommonStrings } from "./common";
import { AR as AR_AUTH, EN as EN_AUTH, type AuthStrings } from "./auth";
import { AR as AR_STORY, EN as EN_STORY, type StoryStrings } from "./story";
import { AR as AR_ERRORS, EN as EN_ERRORS, type ErrorStrings } from "./errors";
import { AR as AR_ACCOUNT, EN as EN_ACCOUNT, type AccountStrings } from "./account";
import { AR as AR_LIBRARY, EN as EN_LIBRARY, type LibraryStrings } from "./library";
import { AR as AR_RENTALS, EN as EN_RENTALS, type RentalsStrings } from "./rentals";
import { AR as AR_PAYMENTS, EN as EN_PAYMENTS, type PaymentsStrings } from "./payments";
import { AR as AR_CONTESTS, EN as EN_CONTESTS, type ContestsStrings } from "./contests";
import { AR as AR_MODERATION, EN as EN_MODERATION, type ModerationStrings } from "./moderation";
import { AR as AR_SOCIAL, EN as EN_SOCIAL, type SocialStrings } from "./social";
import { AR as AR_PROFILE, EN as EN_PROFILE, type ProfileStrings } from "./profile";
import { AR as AR_BOOKS, EN as EN_BOOKS, type BooksStrings } from "./books";
import { AR as AR_CHECKOUT, EN as EN_CHECKOUT, type CheckoutStrings } from "./checkout";
import { AR as AR_DASHBOARD, EN as EN_DASHBOARD, type DashboardStrings } from "./dashboard";

export type { ShellStrings } from "./shell";
export type { CommonStrings } from "./common";
export type { AuthStrings } from "./auth";
export type { StoryStrings } from "./story";
export type { ErrorStrings } from "./errors";
export type { AccountStrings } from "./account";
export type { LibraryStrings } from "./library";
export type { RentalsStrings } from "./rentals";
export type { PaymentsStrings } from "./payments";
export type { ContestsStrings } from "./contests";
export type { ModerationStrings } from "./moderation";
export type { SocialStrings } from "./social";
export type { ProfileStrings } from "./profile";
export type { BooksStrings } from "./books";
export type { CheckoutStrings } from "./checkout";
export type { DashboardStrings } from "./dashboard";

/**
 * Every string a reader can see, namespaced by the surface that owns it.
 *
 * WHY THE NAMESPACES ARE PER SURFACE. A single flat table of two thousand
 * keys is a table nobody can navigate, and the collisions in it are exactly the
 * strings that drift: two surfaces that both want "loading" and mean different
 * things. One namespace per surface means the surface's copy is edited in one
 * file, and the two locales of a sentence sit side by side.
 *
 * WHY THE DICTIONARY IS EXHAUSTIVE. Every namespace below carries a table for
 * both locales, and a page that shows a string asks the dictionary for it. The
 * product's own rule is that authored content — a story body, a comment, a
 * contest brief — is Arabic by definition and is NOT translated; everything the
 * product says about it is.
 */
export interface AppStrings {
  shell: ShellStrings;
  common: CommonStrings;
  auth: AuthStrings;
  story: StoryStrings;
  errors: ErrorStrings;
  account: AccountStrings;
  library: LibraryStrings;
  rentals: RentalsStrings;
  payments: PaymentsStrings;
  contests: ContestsStrings;
  moderation: ModerationStrings;
  social: SocialStrings;
  profile: ProfileStrings;
  books: BooksStrings;
  checkout: CheckoutStrings;
  dashboard: DashboardStrings;
}

const AR: AppStrings = {
  shell: AR_SHELL,
  common: AR_COMMON,
  auth: AR_AUTH,
  story: AR_STORY,
  errors: AR_ERRORS,
  account: AR_ACCOUNT,
  library: AR_LIBRARY,
  rentals: AR_RENTALS,
  payments: AR_PAYMENTS,
  contests: AR_CONTESTS,
  moderation: AR_MODERATION,
  social: AR_SOCIAL,
  profile: AR_PROFILE,
  books: AR_BOOKS,
  checkout: AR_CHECKOUT,
  dashboard: AR_DASHBOARD,
};

const EN: AppStrings = {
  shell: EN_SHELL,
  common: EN_COMMON,
  auth: EN_AUTH,
  story: EN_STORY,
  errors: EN_ERRORS,
  account: EN_ACCOUNT,
  library: EN_LIBRARY,
  rentals: EN_RENTALS,
  payments: EN_PAYMENTS,
  contests: EN_CONTESTS,
  moderation: EN_MODERATION,
  social: EN_SOCIAL,
  profile: EN_PROFILE,
  books: EN_BOOKS,
  checkout: EN_CHECKOUT,
  dashboard: EN_DASHBOARD,
};

const DICTIONARIES: Record<Locale, AppStrings> = { ar: AR, en: EN };

/** All copy for `locale`, namespaced by domain. */
export function stringsFor(locale: Locale): AppStrings {
  return DICTIONARIES[locale];
}

/** `ar-EG` and `en-GB`, for `Intl` and `toLocaleDateString`. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG" : "en-GB";
}

/**
 * WESTERN DIGITS, ON DATES TOO.
 *
 * `toLocaleDateString("ar-EG")` renders Arabic-Indic digits, which is the one
 * place the product's digit convention was not applied: the same row showed
 * "١٤ أكتوبر ٢٠٢٦" beside "1,234" views. The convention is stated once, in
 * `common.ts` for counts and `money.ts` for amounts — Egyptian readers read
 * Western digits, the figures elsewhere in the product are Western, and
 * `hk-numeric` isolates these runs as LTR to begin with. Arabic numerals remain
 * correct in either language; this is a consistency rule, not a correctness one.
 *
 * The numbering system is pinned rather than the locale, so the month and
 * weekday names stay in the reader's language ("أكتوبر") while the digits stay
 * Western. Every date in the product is rendered through one of the helpers
 * below so the rule has exactly one implementation to break.
 */
const WESTERN_DIGITS: Intl.DateTimeFormatOptions = { numberingSystem: "latn" };

/** A short date: `14/10/2026`. */
export function formatDate(value: string | Date, intl: string): string {
  return new Date(value).toLocaleDateString(intl, WESTERN_DIGITS);
}

/** A long date: `14 أكتوبر 2026`. */
export function formatLongDate(value: string | Date, intl: string): string {
  return new Date(value).toLocaleDateString(intl, {
    ...WESTERN_DIGITS,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** A clock time: `14:30`. */
export function formatTime(value: string | Date, intl: string): string {
  return new Date(value).toLocaleTimeString(intl, WESTERN_DIGITS);
}

/** A date and a time together: `14/10/2026, 14:30`. */
export function formatDateTime(value: string | Date, intl: string): string {
  return new Date(value).toLocaleString(intl, WESTERN_DIGITS);
}
