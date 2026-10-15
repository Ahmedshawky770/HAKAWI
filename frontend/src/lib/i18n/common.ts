/**
 * Shared UI copy — the loading label, the error and success surfaces, the
 * avatar fallback, and the search results line. Rendered by the shared
 * components (`Loading`, `ErrorMessage`, `Avatar`) and the search page via
 * `useStrings().common`.
 */

/**
 * The digits of a count, grouped.
 *
 * Pinned to `en-US` grouping rather than the runtime's locale on purpose: the
 * product's convention is Western digits in both locales (the same convention
 * `money.ts` states for figures), and the runtime default differs between Node
 * and the browser — inheriting it would hydrate one shape and render another.
 */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/**
 * A count split into its digits and its noun.
 *
 * WHY THE SPLIT EXISTS: `.hk-numeric` isolates a run with `direction: ltr;
 * unicode-bidi: isolate`, and isolating a whole Arabic phrase reorders the
 * words around it — the rule `money.ts` states for amounts. A readout that
 * wants tabular figures therefore wraps `count` and leaves `label` as plain
 * text inside the sentence.
 */
export interface CountReadout {
  count: string;
  label: string;
}

/**
 * The one pluralization rule in the product, implemented once here: the noun
 * follows the count's plural category under `pluralLocale`'s rules, so Arabic
 * gets its dual ("مشاهدتان") and English its simple s. The form tables passed
 * in are per-domain data — the story and search readouts carry their own nouns
 * without re-implementing the rule.
 *
 * WHY THE RULE SETS ARE MODULE SCOPE AND NOT PER CALL: the locale set is the
 * closed `"ar"`/`"en"` pair, and the search page's results count re-renders on
 * every keystroke — constructing an `Intl.PluralRules` per readout is the one
 * avoidable `Intl` allocation on that path.
 */
const PLURAL_RULES: Record<"ar" | "en", Intl.PluralRules> = {
  ar: new Intl.PluralRules("ar"),
  en: new Intl.PluralRules("en"),
};

export function countReadout(count: number, pluralLocale: "ar" | "en", forms: Record<string, string>): CountReadout {
  const rule = PLURAL_RULES[pluralLocale].select(count);
  return { count: formatCount(count), label: forms[rule] ?? forms.other };
}

export interface CommonStrings {
  loading: string;
  errorTitle: string;
  retry: string;
  success: string;
  avatarFallback: string;
  search: string;
  noResults: string;
  resultsCount: (count: number) => CountReadout;
}

export const AR: CommonStrings = {
  loading: "جارٍ التحميل…",
  errorTitle: "حدث خطأ",
  retry: "أعد المحاولة",
  success: "تم",
  avatarFallback: "؟",
  search: "بحث",
  noResults: "لا توجد نتائج",
  resultsCount: (count) =>
    countReadout(count, "ar", { zero: "نتائج", one: "نتيجة", two: "نتيجتان", few: "نتائج", many: "نتيجةً", other: "نتيجة" }),
};

export const EN: CommonStrings = {
  loading: "Loading…",
  errorTitle: "Something went wrong",
  retry: "Retry",
  success: "Done",
  avatarFallback: "?",
  search: "Search",
  noResults: "No results",
  resultsCount: (count) => countReadout(count, "en", { one: "result", other: "results" }),
};
