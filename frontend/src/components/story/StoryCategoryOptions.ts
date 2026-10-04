/**
 * The story categories, once.
 *
 * WHY A SEPARATE MODULE. The same four values were typed into the stories index
 * filter, the create form and the edit form — three copies of one list that the
 * API validates. A fifth story genre would appear in one form and be missing
 * from another, and the reader would find out by submitting a story the server
 * rejects.
 *
 * The labels are the Arabic display names; the VALUES are the wire identifiers
 * the list endpoint filters on (`api.listStories({ category })`) and the payload
 * field the write endpoints take, so they are never translated. A reader can
 * switch the shell to English and the category a story is filed under must not
 * change underneath them.
 */
export const ALL_CATEGORIES_VALUE = "";

export const STORY_CATEGORIES: { value: string; label: string }[] = [
  { value: "fiction", label: "خيال" },
  { value: "non-fiction", label: "واقعي" },
  { value: "poetry", label: "شعر" },
  { value: "fantasy", label: "فانتازيا" },
];

/** The filter's options: "everything" plus the four categories. */
export const STORY_CATEGORY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_CATEGORIES_VALUE, label: "جميع التصنيفات" },
  ...STORY_CATEGORIES,
];