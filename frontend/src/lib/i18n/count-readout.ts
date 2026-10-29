import type { Locale } from "@/lib/preferences";

export interface CountReadout {
  count: string;
  label: string;
}

type PluralForms = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

/**
 * Returns a localized count readout with the formatted number and the correct
 * plural form for the given locale.
 *
 * The number is formatted with `Intl.NumberFormat` using the locale, and the
 * label is selected via `Intl.PluralRules` using CLDR plural categories.
 *
 * Arabic uses six categories (zero, one, two, few, many, other); English uses
 * two (one, other). The `other` key is mandatory because every locale has it.
 */
export function countReadout(
  value: number,
  locale: Locale,
  forms: PluralForms,
): CountReadout {
  const intlLocale = locale === "ar" ? "ar-EG" : "en-GB";
  const formattedCount = new Intl.NumberFormat(intlLocale).format(value);
  const pluralRule = new Intl.PluralRules(intlLocale);
  const category = pluralRule.select(value);

  const label = forms[category] ?? forms.other;

  return { count: formattedCount, label };
}