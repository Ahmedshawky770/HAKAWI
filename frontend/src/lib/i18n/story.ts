import { countReadout, type CountReadout } from "./common";
import type { Locale } from "@/lib/preferences";

/**
 * Story readouts and the story pages' chrome.
 *
 * The counts are split into digits and noun (`CountReadout`) rather than
 * returned as one phrase because their only render sites wrap the digits in
 * `.hk-numeric`, and an LTR isolate around a whole Arabic phrase reorders the
 * words around it — see `common.ts` for the rule.
 */
export interface StoryStrings {
  uncategorized: string;
  authorProfile: string;
  /** The byline prefix plus the author's name: "بواسطة أحمد". */
  authorByline: (name: string) => string;
  views: (count: number) => CountReadout;
  reactions: (count: number) => CountReadout;
  storiesPageDescription: string;
  storiesCategoryLabel: string;
  storiesEmptyInCategory: string;
  storiesEmptyHere: string;
  storyOpenFailed: string;
  storiesLoadFailed: string;
  storyPublishFailed: string;
  storyEditOpenFailed: string;
  storyEditSaveFailed: string;
  storyDeleteSucceeded: string;
  storyDeleteFailed: string;
  createPageTitle: string;
  createPageDescription: string;
  createSubmitButton: string;
  storyCreateFailed: string;
  editPageTitle: string;
  editPageDescription: string;
  editSubmitButton: string;
  storyEditLoadFailed: string;
  storyEditUpdateFailed: string;
  storyNotFound: string;
  storyNotFoundDescription: string;
  backToStories: string;
  titleLabel: string;
  titlePlaceholder: string;
  titleLimitReached: string;
  titleRemaining: (count: number) => string;
  contentLabel: string;
  contentPlaceholder: string;
  contentHint: string;
  contentEditHint: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  tagsHint: string;
  cancelButton: string;
}

export const AR: StoryStrings = {
  uncategorized: "بدون تصنيف",
  authorProfile: "ملف الكاتب",
  authorByline: (name) => `بواسطة ${name}`,
  // CLDR's Arabic forms, in the order `Intl.PluralRules("ar")` selects them:
  // 1 → one (مفرد), 2 → two (مثنى), 3–10 → few (جمع), 11–99 → many (مفرد منصوب),
  // 100 and every round hundred → other (مفرد مرفوع).
  //
  // `other` is the form the reactions table got wrong: it carried the plural
  // "تفاعلات", so 100 reactions read "100 تفاعلات" right below 100 views that
  // said "100 مشاهدة". The views table was the correct one to copy. `many` takes
  // the accusative singular ("مشاهدةً", "تفاعلاً"), the form `money.ts`'s
  // `formatDayCount` states for eleven days and up.
  views: (count) =>
    countReadout(count, "ar", { zero: "مشاهدات", one: "مشاهدة", two: "مشاهدتان", few: "مشاهدات", many: "مشاهدةً", other: "مشاهدة" }),
  reactions: (count) =>
    countReadout(count, "ar", { zero: "تفاعلات", one: "تفاعل", two: "تفاعلان", few: "تفاعلات", many: "تفاعلاً", other: "تفاعل" }),
  storiesPageDescription: "كل الحكايات المنشورة، وأحدثها أولاً.",
  storiesCategoryLabel: "التصنيف",
  storiesEmptyInCategory: "لا توجد قصص في هذا التصنيف. جرّب تصنيفاً آخر أو اكتب أول قصة.",
  storiesEmptyHere: "لم يُنشر شيء بعد. كن أول من يروي حكاية.",
  storyOpenFailed: "تعذّر فتح القصة",
  storiesLoadFailed: "تعذّر تحميل القصص",
  storyPublishFailed: "تعذّر نشر القصة",
  storyEditOpenFailed: "تعذّر فتح القصة للتعديل",
  storyEditSaveFailed: "تعذّر حفظ التعديلات",
  storyDeleteSucceeded: "تم حذف القصة",
  storyDeleteFailed: "تعذّر حذف القصة",
  createPageTitle: "إنشاء قصة",
  createPageDescription: "اكتب حكايتك، وامنحها تصنيفاً يقرّبها من القرّاء.",
  createSubmitButton: "إنشاء القصة",
  storyCreateFailed: "فشل إنشاء القصة",
  editPageTitle: "تعديل القصة",
  editPageDescription: "عدّل ما كتبته، وستبقى التعديلات على القصة نفسها.",
  editSubmitButton: "حفظ التغييرات",
  storyEditLoadFailed: "فشل تحميل القصة",
  storyEditUpdateFailed: "فشل تحديث القصة",
  storyNotFound: "القصة غير موجودة",
  storyNotFoundDescription: "ربما حُذفت أو تغيّر رابطها.",
  backToStories: "العودة للقصص",
  titleLabel: "العنوان",
  titlePlaceholder: "أدخل عنوان القصة",
  titleLimitReached: "وصلت الحد الأقصى لطول العنوان",
  titleRemaining: (count) => `${count} حرفاً متبقياً`,
  contentLabel: "المحتوى",
  contentPlaceholder: "اكتب قصتك هنا...",
  contentHint: "اكتب الحكاية كما تُروى: فقرات قصيرة، وفصل بين المشاهد.",
  contentEditHint: "اترك الحقل فارغاً إن كنت تريد حذف نص القصة.",
  tagsLabel: "الوسوم (مفصولة بفاصلة)",
  tagsPlaceholder: "مغامرة، غموض",
  tagsHint: "افصل بين الوسوم بفاصلة",
  cancelButton: "إلغاء",
};

export const EN: StoryStrings = {
  uncategorized: "Uncategorized",
  authorProfile: "Author's profile",
  authorByline: (name) => `By ${name}`,
  views: (count) => countReadout(count, "en", { one: "view", other: "views" }),
  reactions: (count) => countReadout(count, "en", { one: "reaction", other: "reactions" }),
  storiesPageDescription: "Every published story, newest first",
  storiesCategoryLabel: "Category",
  storiesEmptyInCategory: "No stories in this category. Try another one, or write the first.",
  storiesEmptyHere: "Nothing published yet. Be the first to tell a story.",
  storyOpenFailed: "Couldn't open the story",
  storiesLoadFailed: "Couldn't load stories",
  storyPublishFailed: "Couldn't publish the story",
  storyEditOpenFailed: "Couldn't open the story for editing",
  storyEditSaveFailed: "Couldn't save your changes",
  storyDeleteSucceeded: "The story was deleted",
  storyDeleteFailed: "Couldn't delete the story",
  createPageTitle: "Write a story",
  createPageDescription: "Write your story, and give it a category that brings it closer to readers.",
  createSubmitButton: "Create story",
  storyCreateFailed: "Couldn't create the story",
  editPageTitle: "Edit story",
  editPageDescription: "Edit what you wrote; the changes stay on the same story.",
  editSubmitButton: "Save changes",
  storyEditLoadFailed: "Couldn't load the story",
  storyEditUpdateFailed: "Couldn't update the story",
  storyNotFound: "Story not found",
  storyNotFoundDescription: "It may have been deleted, or its link may have changed.",
  backToStories: "Back to stories",
  titleLabel: "Title",
  titlePlaceholder: "Enter the story's title",
  titleLimitReached: "You've reached the title length limit",
  titleRemaining: (count) => `${count} characters left`,
  contentLabel: "Content",
  contentPlaceholder: "Write your story here…",
  contentHint: "Write the tale as it is told: short paragraphs, with a break between scenes.",
  contentEditHint: "Leave the field empty if you want to remove the story's text.",
  tagsLabel: "Tags (comma separated)",
  tagsPlaceholder: "Adventure, mystery",
  tagsHint: "Separate tags with a comma",
  cancelButton: "Cancel",
};

/**
 * The category labels, one table per locale — the single source for the four
 * genres and the filter's "everything".
 *
 * WHY THIS IS NOT IN `StoryStrings`: the interface is the copy a component reads
 * through `useStrings().story`, and these labels are keyed by the *wire value*
 * the API sends (`fiction`, `non-fiction`), not by a component's need. Routing
 * them through the interface would put a second, unreachable path to the same
 * words beside this one, and two paths to one string is how they drift apart.
 * Adding a genre is a new entry in both columns below, not a branch anywhere.
 *
 * WHY THE FILTER'S "EVERYTHING" IS THE EMPTY KEY AND NOT `"all"`: the filter
 * option's value is `""` (`ALL_CATEGORIES_VALUE` in `StoryCategoryOptions.ts`)
 * and the API only ever sends the four genre values, so no runtime path can
 * look up `"all"`. A table row nothing reaches is a copy of the `""` row that
 * can silently disagree with it, so it is not here; the two rows' single value
 * is the one the filter actually reads.
 */
const CATEGORY_LABELS: Record<Locale, Record<string, string>> = {
  ar: {
    "": "جميع التصنيفات",
    fiction: "خيال",
    "non-fiction": "واقعي",
    poetry: "شعر",
    fantasy: "فانتازيا",
  },
  en: {
    "": "All categories",
    fiction: "Fiction",
    "non-fiction": "Non-fiction",
    poetry: "Poetry",
    fantasy: "Fantasy",
  },
};

/**
 * The wire value, localized.
 *
 * A value the dictionary does not know is passed through as the raw API
 * identifier — a deliberate policy, not a gap: the category was written by the
 * author, so showing the backend's own word is more honest to the writer than
 * blanking it, and `StoryMeta` marks the unknown case visually.
 */
export function storyCategoryLabel(value: string, locale: Locale): string {
  return CATEGORY_LABELS[locale][value] ?? value;
}
