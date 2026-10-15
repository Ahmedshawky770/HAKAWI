import type { Locale } from "@/lib/preferences";

import { AR as AR_SHELL, EN as EN_SHELL, type ShellStrings } from "./shell";
import { AR as AR_COMMON, EN as EN_COMMON, type CommonStrings } from "./common";
import { AR as AR_AUTH, EN as EN_AUTH, type AuthStrings } from "./auth";
import { AR as AR_STORY, EN as EN_STORY, type StoryStrings } from "./story";

export type { ShellStrings } from "./shell";
export type { CommonStrings } from "./common";
export type { AuthStrings } from "./auth";
export type { StoryStrings } from "./story";

export interface AppStrings {
  shell: ShellStrings;
  common: CommonStrings;
  auth: AuthStrings;
  story: StoryStrings;
}

const AR: AppStrings = {
  shell: AR_SHELL,
  common: AR_COMMON,
  auth: AR_AUTH,
  story: AR_STORY,
};

const EN: AppStrings = {
  shell: EN_SHELL,
  common: EN_COMMON,
  auth: EN_AUTH,
  story: EN_STORY,
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
