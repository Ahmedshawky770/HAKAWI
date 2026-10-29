import type { Locale } from "@/lib/preferences";
import { countReadout, type CountReadout } from "./count-readout";

export { countReadout, type CountReadout } from "./count-readout";

/**
 * Formats a number with the locale's numbering system (Western digits for both
 * Arabic and English, per the product's digit convention).
 */
export function formatCount(value: number, locale: Locale = "ar"): string {
  const intlLocale = locale === "ar" ? "ar-EG" : "en-GB";
  return new Intl.NumberFormat(intlLocale).format(value);
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
  /** The accessible name of a dismiss control — a toast's close button, a banner's close. */
  dismiss: string;
  /** The accessible name of a close control. */
  close: string;
  /** The label for an overflow/more menu. */
  more: string;
  /** The not-found page's heading. */
  notFoundTitle: string;
  /** The not-found page's body copy. */
  notFoundDescription: string;
  /** The generic error page's body copy. */
  errorDescription: string;
  /** The link back to the product's front door. */
  backHome: string;
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
  dismiss: "إغلاق",
  close: "إغلاق",
  more: "المزيد",
  notFoundTitle: "الصفحة غير موجودة",
  notFoundDescription: "الرابط الذي فتحته لا يشير إلى شيء في حكاوي.",
  errorDescription: "حدث خطأ غير متوقع في هذه الصفحة.",
  backHome: "العودة إلى الرئيسية",
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
  dismiss: "Dismiss",
  close: "Close",
  more: "More",
  notFoundTitle: "This page does not exist",
  notFoundDescription: "The link you opened doesn't point to anything on Hakawi.",
  errorDescription: "Something unexpected happened on this page.",
  backHome: "Back to the home page",
};