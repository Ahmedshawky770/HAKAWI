import { RENTAL_CURRENCY } from "@hakawi/shared-types";

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
 * Two decimals always — a price is never rounded for display — and localised
 * digits, because the rest of the product is Arabic.
 *
 * NOT WRAPPED IN `hk-numeric` HERE. The caller's job: an amount on its own line
 * wants the LTR isolate, and an amount inside an Arabic sentence does not, because
 * isolating it reorders the words around it.
 */
export function formatPrice(piastres: number | null | undefined, currency: string = RENTAL_CURRENCY): string {
  if (typeof piastres !== "number" || !Number.isFinite(piastres)) return "";
  return `${FIGURES.format(piastres / 100)} ${currencySymbol(currency)}`;
}

/** Arabic day counts: 1 يوم, 2 يومان, 3–10 أيام, 11+ يوماً. */
export function formatDayCount(days: number): string {
  if (days === 1) return "يوم";
  if (days === 2) return "يومان";
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

/**
 * A rental quote: `14000` piastres over 14 days → `140.00 ج.م / 14 يوماً`.
 *
 * One sentence rather than two fragments, because the reader is comparing a rate
 * against a duration and the pair is one fact.
 */
export function formatRentalQuote(piastres: number | null | undefined, days: number): string {
  return `${formatPrice(piastres)} / ${formatDayCount(days)}`;
}