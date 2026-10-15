import type { Locale } from "@/lib/preferences";
import { storyCategoryLabel } from "@/lib/i18n/story";

const ALL_CATEGORIES_VALUE = "";

const STORY_CATEGORY_VALUES = ["fiction", "non-fiction", "poetry", "fantasy"] as const;

/**
 * Both option lists are cached per locale at module scope, so every caller for
 * one locale shares a single array instance.
 *
 * WHY IDENTITY MATTERS HERE: the lists are a pure function of constants and the
 * locale, so allocating a fresh array per call buys nothing — but it costs
 * referential equality. The moment `Select` is memoized, a new array every
 * render is a new `options` prop, a re-render of every option, and a memo that
 * never hits. `Locale` is a closed set and the dictionaries never mutate at
 * runtime, so the cache holds for the page's lifetime; no caller mutates the
 * shared arrays (the edit page spreads a copy when it appends the story's own
 * category).
 */
const STORY_CATEGORY_CACHE = new Map<Locale, { value: string; label: string }[]>();
const STORY_CATEGORY_FILTER_CACHE = new Map<Locale, { value: string; label: string }[]>();

function cachedStoryCategories(locale: Locale): { value: string; label: string }[] {
  const cached = STORY_CATEGORY_CACHE.get(locale);
  if (cached) return cached;

  const options = STORY_CATEGORY_VALUES.map((value) => ({ value, label: storyCategoryLabel(value, locale) }));
  STORY_CATEGORY_CACHE.set(locale, options);
  return options;
}

export function storyCategories(locale: Locale): { value: string; label: string }[] {
  return cachedStoryCategories(locale);
}

export function storyCategoryFilterOptions(locale: Locale): { value: string; label: string }[] {
  const cached = STORY_CATEGORY_FILTER_CACHE.get(locale);
  if (cached) return cached;

  const options = [
    { value: ALL_CATEGORIES_VALUE, label: storyCategoryLabel(ALL_CATEGORIES_VALUE, locale) },
    ...cachedStoryCategories(locale),
  ];
  STORY_CATEGORY_FILTER_CACHE.set(locale, options);
  return options;
}
