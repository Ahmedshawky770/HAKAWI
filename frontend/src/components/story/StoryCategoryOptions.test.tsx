import { describe, expect, it } from "vitest";

import { storyCategories, storyCategoryFilterOptions } from "@/components/story/StoryCategoryOptions";
import { storyCategoryLabel } from "@/lib/i18n/story";

const LOCALES = ["ar", "en"] as const;

/** The four genre wire values the API sends — `STORY_CATEGORY_VALUES` in the module. */
const GENRES = ["fiction", "non-fiction", "poetry", "fantasy"];

describe("storyCategories", () => {
  it.each(LOCALES)("returns the very same array on every call, for %s", (locale) => {
    // The identity cache the module's comment describes: a pure function of
    // constants and the locale must not allocate a fresh array per call, or the
    // memoized `Select` it feeds re-renders every option on every pass.
    expect(storyCategories(locale)).toBe(storyCategories(locale));
  });

  it.each(LOCALES)("carries the four genres, each labelled through the dictionary, for %s", (locale) => {
    const options = storyCategories(locale);

    expect(options.map((option) => option.value)).toEqual(GENRES);
    for (const option of options) {
      expect(option.label).toBe(storyCategoryLabel(option.value, locale));
    }
  });
});

describe("storyCategoryFilterOptions", () => {
  it.each(LOCALES)("returns the very same array on every call, for %s", (locale) => {
    // A second cache from the genres' own: the filter list is memoized as well.
    expect(storyCategoryFilterOptions(locale)).toBe(storyCategoryFilterOptions(locale));
  });

  it.each(LOCALES)("starts with the all-categories entry, then the four genres, for %s", (locale) => {
    const options = storyCategoryFilterOptions(locale);

    expect(options).toHaveLength(GENRES.length + 1);
    // `ALL_CATEGORIES_VALUE` is the empty key — the value the API never sends
    // and the one the filter reads to mean "everything".
    expect(options.map((option) => option.value)).toEqual(["", ...GENRES]);
  });

  it.each(LOCALES)("labels the everything entry through the dictionary's empty key, for %s", (locale) => {
    const [everything, ...genres] = storyCategoryFilterOptions(locale);

    expect(everything.label).toBe(storyCategoryLabel("", locale));
    // The genres behind it are the very list `storyCategories` hands out.
    expect(genres).toEqual(storyCategories(locale));
  });
});
