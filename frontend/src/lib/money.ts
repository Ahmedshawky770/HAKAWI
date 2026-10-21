import { RENTAL_CURRENCY } from "@hakawi/shared-types";

import type { Locale } from "@/lib/preferences";

/**
 * Money, in the one currency the product charges in, from one module.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MATTERS MORE THAN FORMATTING
 *
 * Two facts were being duplicated as string literals on the frontend:
 *
 * - **The currency.** `RENTAL_CURRENCY` is `EGP` and the backend sends `EGP` to
 *   Paymob, but the book surfaces printed `$`. A dollar sign on an Egyptian-pound
 *   price is not a formatting choice; it is a price the reader believes they are
 *   paying.
 * - **The unit.** `books.price` and `RENTAL_PRICE_PER_DAY_PIASTERS` are both
 *   integers in PIASTRES (1 EGP = 100 piastres) — the shared-types contract says
 *   so, and `books.service.ts` forwards `book.price` to the gateway untouched.
 *   The rental quote divided by 100; the book price did not, so a book stored at
 *   `25` was rendered as "25.00 ج.م" instead of "0.25 ج.م" — off by a factor of a
 *   hundred on a page whose entire job is the price.
 *
 * Every amount is therefore read as piastres here, and there is exactly one
 * division by 100 in the product.
 *
 * The symbol is derived from `RENTAL_CURRENCY` rather than written into the
 * strings, so the day the product charges in a second currency this file is the
 * only place that has to learn it.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: "ج.م",
  USD: "$",
  EUR: "€",
};

/**
 * WESTERN DIGITS, DELIBERATELY, IN BOTH LOCALES.
 *
 * `toLocaleString("ar-EG")` renders Arabic-Indic digits — and the old rental quote
 * did exactly that, so the book price said "25.00" two inches above a quote that
 * said "٢٥٫٠٠" for the same product. Beyond the inconsistency: Egyptian readers
 * overwhelmingly read and write Western digits, the figures elsewhere in the
 * product (view counts, page numbers, progress) are Western, and `hk-numeric`
 * isolates these runs with `direction: ltr`, which is an LTR-digit convention to
 * begin with. Arabic numerals remain correct in either language.
 */
const FIGURES = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function currencySymbol(currency: string = RENTAL_CURRENCY): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

/**
 * A price: `2500` piastres → `25.00 ج.م`.
 *
 * Two decimals always — a price is never rounded for display — and Western
 * digits in BOTH locales, because the rest of the product is.
 *
 * NOT WRAPPED IN `hk-numeric` HERE. The caller's job: an amount on its own line
 * wants the LTR isolate, and an amount inside an Arabic sentence does not, because
 * isolating it reorders the words around it.
 *
 * AN AMOUNT THAT IS NOT THERE IS AN EMPTY STRING, NOT A ZERO. A free book has
 * no price, and "0.00 ج.م" is a price — a wrong one, on a surface that takes
 * money. So a book with no price is rendered with the product's own "free"
 * label by the caller, and this function says "there is no amount" rather than
 * inventing one. A caller that has already established that there IS an amount
 * is rendering a real price, and `0` is a real price.
 */
export function formatPrice(piastres: number | null | undefined, currency: string = RENTAL_CURRENCY): string {
  if (typeof piastres !== "number" || !Number.isFinite(piastres)) return "";
  return `${FIGURES.format(piastres / 100)} ${currencySymbol(currency)}`;
}

/**
 * A count of days, in the reader's language.
 *
 * Arabic day counts: 1 يوم, 2 يومان, 3–10 أيام, 11+ يوماً.
 *
 * ZERO IS NOT A DURATION. "0 أيام" is a number with a noun bolted to it, and
 * a rental that has no days in it is not a rental of zero days — it is less
 * than a day, which is the phrase a reader can act on.
 *
 * A NEGATIVE COUNT IS NOT A DURATION EITHER. "-3 days" is an arithmetic
 * accident that says nothing about a rental; what it means is that the rental
 * ENDED three days ago, so it is said as the time since the end.
 */
export function formatDayCount(days: number, locale: Locale = "ar"): string {
  if (days < 0) return formatElapsedDays(-days, locale);
  if (days === 0) return locale === "en" ? "less than a day" : "أقل من يوم";
  if (locale === "en") {
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (days === 1) return "يوم";
  if (days === 2) return "يومان";
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

/**
 * A count of days that has ALREADY PASSED: "منذ 3 أيام" / "3 days ago".
 *
 * IT IS NOT `formatDayCount` WITH A PREFIX. Arabic changes its noun after
 * "منذ": the dual is "يومين" there and "يومان" everywhere else, so the form
 * is written out rather than composed out of the duration's own words.
 */
function formatElapsedDays(days: number, locale: Locale): string {
  if (locale === "en") return days === 1 ? "1 day ago" : `${days} days ago`;
  if (days === 1) return "منذ يوم";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يوماً`;
}

/**
 * A rental quote: `14000` piastres over 14 days → `140.00 ج.م / 14 يوماً`.
 *
 * One sentence rather than two fragments, because the reader is comparing a rate
 * against a duration and the pair is one fact.
 *
 * THE LOCALE IS A PARAMETER, NOT AN ASSUMPTION. The day count is a WORD, and a
 * word has a language: "14 يوماً" in an English interface is a leak of the
 * other half of the product. `formatPrice` stays locale-free on purpose — the
 * figures and the symbol are the same in both languages — but the noun beside
 * them is not, so the caller says which language it is writing in.
 *
 * AND THE SYMBOL IS ARABIC IN BOTH LANGUAGES, ON PURPOSE. The product charges
 * in one currency — the Egyptian pound — and `ج.م` is the abbreviation this
 * product uses for it, in the same way that the Arabic prose it publishes is
 * not translated either. The symbol is the one thing on this line that does not
 * change with the reader's language, and the comment above says why: it is
 * the unit, not a word.
 */
export function formatRentalQuote(piastres: number | null | undefined, days: number, locale: Locale = "ar"): string {
  return `${formatPrice(piastres)} / ${formatDayCount(days, locale)}`;
}