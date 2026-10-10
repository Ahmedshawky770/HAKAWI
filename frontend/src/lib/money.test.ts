/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, expect, it } from "vitest";
import { RENTAL_CURRENCY, rentalPriceForDays } from "@hakawi/shared-types";

import { currencySymbol, formatDayCount, formatPrice, formatRentalQuote } from "@/lib/money";

/**
 * The two facts these tests exist to protect.
 *
 * 1. **The currency.** `RENTAL_CURRENCY` is `EGP`; the book surfaces used to
 *    print `$`. A wrong symbol on a price is a wrong price.
 * 2. **The unit.** Every amount the API sends is an integer in PIASTRES
 *    (1 EGP = 100). The rental quote divided by 100 and the book price did not,
 *    which rendered a 25-piastre book as 25 pounds. `formatPrice` is the only
 *    place in the frontend that divides, so these tests pin the conversion
 *    rather than a rendered string that could be right by accident.
 */
describe("money", () => {
  it("takes its symbol from the shared currency, not from a literal", () => {
    expect(RENTAL_CURRENCY).toBe("EGP");
    expect(currencySymbol()).toBe("ج.م");
    expect(currencySymbol("USD")).toBe("$");
  });

  it("falls back to the code itself for a currency it has no symbol for", () => {
    // Better than inventing a glyph that could be mistaken for another currency.
    expect(currencySymbol("GBP")).toBe("GBP");
  });

  it("converts piastres to pounds exactly once", () => {
    expect(formatPrice(2500)).toBe("25.00 ج.م");
    expect(formatPrice(1000)).toBe("10.00 ج.م");
    expect(formatPrice(250)).toBe("2.50 ج.م");
    expect(formatPrice(1)).toBe("0.01 ج.م");
  });

  it("always shows two decimals, because a price is never rounded for display", () => {
    expect(formatPrice(1000)).toContain("10.00");
    expect(formatPrice(1234)).toContain("12.34");
  });

  it("uses Western digits in both locales, which is what the rest of the product does", () => {
    // The old rental quote rendered Arabic-Indic digits while the book price two
    // inches above it rendered Western ones. Egyptian readers overwhelmingly read
    // Western digits, every other figure in the product is Western, and
    // `hk-numeric` isolates these runs as LTR.
    expect(formatPrice(1234567)).toBe("12,345.67 ج.م");
  });

  it("renders nothing for a missing price rather than a zero", () => {
    expect(formatPrice(null)).toBe("");
    expect(formatPrice(undefined)).toBe("");
    expect(formatPrice(Number.NaN)).toBe("");
  });

  it("quotes a rental from the shared daily rate, so screen and payment cannot disagree", () => {
    // The default 14-day rental at 1000 piastres a day.
    expect(formatRentalQuote(rentalPriceForDays(14), 14)).toBe("140.00 ج.م / 14 يوماً");
  });

  it("counts days the way the language does", () => {
    expect(formatDayCount(1)).toBe("يوم");
    expect(formatDayCount(2)).toBe("يومان");
    expect(formatDayCount(7)).toBe("7 أيام");
    expect(formatDayCount(30)).toBe("30 يوماً");
  });
});