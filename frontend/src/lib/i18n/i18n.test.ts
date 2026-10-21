/// <reference types="@testing-library/jest-dom/vitest" />

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatLongDate, formatTime, intlLocale, stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { storyCategoryLabel } from "@/lib/i18n/story";

/**
 * WHAT THIS SUITE EXISTS TO HOLD STILL.
 *
 * Three promises the change set makes about the dictionary, none of which a
 * consumer's suite can catch when they break:
 *
 * 1. **Key parity.** Every locale carries the same keys, in the same order. A
 *    missing key is a fallback the reader never sees; an extra one is a string
 *    nobody will ever translate.
 * 2. **Arabic count forms match what `Intl.PluralRules("ar")` actually selects**,
 *    and `other` (100 and every round hundred) uses the SINGULAR noun — "100
 *    مشاهدة", not "100 مشاهدة". This is where the product shipped its one real
 *    string bug.
 * 3. **Every date is rendered in Western digits**, in both locales, because
 *    `toLocaleDateString("ar-EG")` silently renders Arabic-Indic ones and the
 *    rest of the product is Western (see the note above `formatDate`).
 * 4. **No literal in the table disagrees with that digit rule, and no key is
 *    left without a value.** The date helpers pin their digits; a bare string
 *    in the dictionary has nothing to pin it, so the table itself is walked for
 *    Arabic-Indic digits and for `undefined`.
 */
/**
 * The leaf key paths of a namespace, so two locales can be compared by NAME and
 * not only at the top level.
 *
 * A namespace is a tree — `contests.facts.category`, `contests.statusLabels.draft`
 * — and a key that exists in one locale's tree and not in the other's is the
 * failure this suite exists to catch. Comparing `Object.keys` of the namespace
 * alone would miss it.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * The namespaces the dictionary MUST carry, whatever else it grows to carry.
 *
 * A FLOOR, NOT A LIST. The dictionary's shape grows with every surface that
 * claims a namespace, so the list is asserted as a SUBSET: a namespace that
 * disappears is caught, and a namespace that is added does not break the
 * suite. `expect(namespaces).toEqual([...])` would be the stronger assertion
 * and the wrong one — it would fail on every new surface, and the engineer who
 * added the surface would delete the entry instead of thinking about it.
 */
const REQUIRED_NAMESPACES: string[] = [
  "shell",
  "common",
  "auth",
  "story",
  "errors",
  "account",
  "library",
  "rentals",
  "payments",
  "contests",
  "moderation",
  "social",
  "profile",
  "books",
  "checkout",
  "dashboard",
];

/**
 * The namespace FILES that live beside this test.
 *
 * Read from the directory rather than written out as a second list of names:
 * a namespace file that is never wired into `AppStrings` is a file of copy the
 * product can never show, and this is the assertion that catches it — the
 * count of namespaces the dictionary exposes cannot be smaller than the count
 * of namespace files that exist.
 */
function namespaceFileCount(): number {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readdirSync(here).filter(
    (name) => name.endsWith(".ts") && name !== "index.ts" && !name.endsWith(".test.ts"),
  ).length;
}

describe("dictionary key parity", () => {
  const namespaces = Object.keys(stringsFor("ar"));

  it.each(namespaces)("%s: Arabic and English declare the same keys, in the same order", (name) => {
    const ar = keyPaths((stringsFor("ar") as unknown as Record<string, unknown>)[name]);
    const en = keyPaths((stringsFor("en") as unknown as Record<string, unknown>)[name]);
    expect(en).toEqual(ar);
  });

  it("exposes both locales through every namespace of AppStrings", () => {
    // The list of namespaces is the dictionary's own shape and it grows with
    // every surface that claims one, so it is compared between the two locales
    // rather than pinned to a list that a new surface would silently break —
    // and the floor of the known namespaces is asserted as a subset, so a
    // namespace that is LOST is caught.
    expect(namespaces).toEqual(expect.arrayContaining(REQUIRED_NAMESPACES));
    expect(Object.keys(stringsFor("en"))).toEqual(namespaces);
    // The floor is only a floor if the count it is compared against is real.
    expect(namespaceFileCount()).toBeGreaterThan(0);
    expect(namespaces.length).toBeGreaterThanOrEqual(namespaceFileCount());
  });

  it("holds no empty string in either locale", () => {
    for (const locale of ["ar", "en"] as const) {
      const strings = stringsFor(locale) as unknown as Record<string, Record<string, unknown>>;
      for (const [namespace, values] of Object.entries(strings)) {
        for (const [key, value] of Object.entries(values)) {
          if (typeof value === "string") {
            expect(value.trim(), `${locale}.${namespace}.${key} is empty`).not.toBe("");
          }
        }
      }
    }
  });

  it("holds no Arabic-Indic digit in either locale", () => {
    // The general form of the password-hint bug: the hint under the register
    // and reset forms shipped "٨" characters while every figure in the product
    // is Western, so the one number a reader must satisfy before signing up was
    // the one number they could misread. Dates pin their digits through
    // `WESTERN_DIGITS`; a literal in the table has nothing to pin it, so the
    // table itself is walked.
    for (const locale of ["ar", "en"] as const) {
      const strings = stringsFor(locale) as unknown as Record<string, Record<string, unknown>>;
      for (const [namespace, values] of Object.entries(strings)) {
        for (const [key, value] of Object.entries(values)) {
          if (typeof value === "string") {
            expect(value, `${locale}.${namespace}.${key} uses an Arabic-Indic digit`).not.toMatch(/[\u0660-\u0669]/);
          }
        }
      }
    }
  });

  it("holds no undefined value in either locale", () => {
    // A key present in one locale's table and absent from the other's is what
    // the parity test catches by key name; this catches the value that exists
    // as a property and was never given a string — the failure mode where the
    // interface is satisfied but the copy is missing, which renders as nothing.
    for (const locale of ["ar", "en"] as const) {
      const strings = stringsFor(locale) as unknown as Record<string, Record<string, unknown>>;
      for (const [namespace, values] of Object.entries(strings)) {
        for (const [key, value] of Object.entries(values)) {
          expect(value, `${locale}.${namespace}.${key} is undefined`).not.toBeUndefined();
        }
      }
    }
  });
});

describe("Arabic count forms", () => {
  const views = (count: number) => stringsFor("ar").story.views(count);
  const reactions = (count: number) => stringsFor("ar").story.reactions(count);

  it("uses Intl's own forms, in the order it selects them", () => {
    for (const count of [0, 1, 2, 3, 10, 11, 52, 99, 100, 101, 1000]) {
      expect(new Intl.PluralRules("ar").select(count)).toBe(
        count === 0 ? "zero" : count === 1 ? "one" : count === 2 ? "two" : count <= 10 ? "few" : count <= 99 ? "many" : "other",
      );
    }
  });

  it("names the views noun in the singular for 100 and every round hundred", () => {
    // The bug this guards: `other` carried the plural "مشاهدات", so 100 views
    // read "100 مشاهدة". Arabic counts the noun singular outside 3–10.
    expect(views(100).label).toBe("مشاهدة");
    expect(views(101).label).toBe("مشاهدة");
    expect(views(1000).label).toBe("مشاهدة");
    expect(views(0).label).toBe("مشاهدات");
    expect(views(2).label).toBe("مشاهدتان");
    expect(views(5).label).toBe("مشاهدات");
    expect(views(1).label).toBe("مشاهدة");
  });

  it("uses the accusative singular for 11–99, the form money.ts states for days", () => {
    expect(views(17).label).toBe("مشاهدةً");
    expect(reactions(17).label).toBe("تفاعلاً");
  });

  it("keeps the reactions noun in the singular for 100 and above", () => {
    expect(reactions(100).label).toBe("تفاعل");
    expect(reactions(1500).label).toBe("تفاعل");
    expect(reactions(2).label).toBe("تفاعلان");
    expect(reactions(8).label).toBe("تفاعلات");
  });

  it("returns the digits and the noun separately, so a caller can isolate only the digits", () => {
    const readout = views(1500);
    expect(readout.count).toBe("1,500");
    expect(readout.label).toBe("مشاهدة");
  });

  it("uses the English one/other pair, with grouping", () => {
    const results = (count: number) => stringsFor("en").common.resultsCount(count);
    expect(results(1)).toEqual({ count: "1", label: "result" });
    expect(results(0)).toEqual({ count: "0", label: "results" });
    expect(results(42)).toEqual({ count: "42", label: "results" });
    expect(results(1500)).toEqual({ count: "1,500", label: "results" });
  });
});

describe("dates", () => {
  const when = "2026-10-14T12:30:00Z";

  it("renders Arabic dates in Western digits, with the month name in Arabic", () => {
    // `toLocaleDateString("ar-EG")` alone gives "١٤‏/١٠‏/٢٠٢٦"; the pinned
    // numbering system is what makes it "14/10/2026" instead.
    expect(formatDate(when, intlLocale("ar")).replace(/\u200f/g, "")).toBe("14/10/2026");
    expect(formatLongDate(when, intlLocale("ar"))).toBe("14 أكتوبر 2026");
  });

  it("keeps the English locale's own shapes", () => {
    expect(formatDate(when, intlLocale("en"))).toBe("14/10/2026");
    expect(formatLongDate(when, intlLocale("en"))).toBe("14 October 2026");
  });

  it("renders times and date-times through the same digit rule", () => {
    expect(formatTime(when, intlLocale("ar"))).not.toMatch(/[\u0660-\u0669]/);
    expect(formatDateTime(when, intlLocale("ar"))).not.toMatch(/[\u0660-\u0669]/);
  });
});

describe("category labels", () => {
  it("localizes the four genres and the filter's everything", () => {
    expect(storyCategoryLabel("fiction", "ar")).toBe("خيال");
    expect(storyCategoryLabel("fiction", "en")).toBe("Fiction");
    expect(storyCategoryLabel("non-fiction", "en")).toBe("Non-fiction");
    expect(storyCategoryLabel("poetry", "ar")).toBe("شعر");
    expect(storyCategoryLabel("fantasy", "en")).toBe("Fantasy");
    // The filter's "everything" value is the empty key — see the note above
    // `CATEGORY_LABELS` for why there is no `"all"` row to read.
    expect(storyCategoryLabel("", "ar")).toBe("جميع التصنيفات");
    expect(storyCategoryLabel("", "en")).toBe("All categories");
  });

  it("passes an unknown wire value through rather than blanking it", () => {
    expect(storyCategoryLabel("essay", "ar")).toBe("essay");
    expect(storyCategoryLabel("essay", "en")).toBe("essay");
  });
});

describe("intlLocale", () => {
  it("gives the app's BCP-47 tag per locale", () => {
    expect(intlLocale(DEFAULT_LOCALE)).toBe("ar-EG");
    expect(intlLocale("en")).toBe("en-GB");
  });
});
