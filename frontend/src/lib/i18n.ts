import type { Locale } from "./preferences";

/**
 * Shell copy, in both locales.
 *
 * SCOPE, STATED PLAINLY: this is the chrome (navigation, header, and the
 * actions the shell owns). Authored content — story bodies, and the prose a
 * reader writes — is Arabic by definition, so it is not translated here. The
 * design system documents the toggle and the direction flip it performs; this
 * table is what makes the chrome itself readable in English.
 */
export interface ShellStrings {
  brand: string;
  brandFull: string;
  tagline: string;
  navHome: string;
  navStories: string;
  navBooks: string;
  navLibrary: string;
  navContests: string;
  navMessages: string;
  navNotifications: string;
  navPayments: string;
  navRentals: string;
  navProfile: string;
  navSearch: string;
  navTrending: string;
  navExplore: string;
  searchPlaceholder: string;
  searchLabel: string;
  createStory: string;
  writeSomething: string;
  signOut: string;
  themeLabel: string;
  themeToLight: string;
  themeToDark: string;
  languageLabel: string;
  menuLabel: string;
  trendingTitle: string;
  trendingEmpty: string;
  mainNavigation: string;
  secondaryNavigation: string;
  skipToContent: string;
}

const ARABIC: ShellStrings = {
  brand: "حكاوي",
  brandFull: "حكاوي — منصة الحكايات",
  tagline: "اكتب حكايتك، واقرأ حكايات غيرك",
  navHome: "الرئيسية",
  navStories: "القصص",
  navBooks: "الكتب",
  navLibrary: "مكتبتي",
  navContests: "المسابقات",
  navMessages: "الرسائل",
  navNotifications: "الإشعارات",
  navPayments: "المدفوعات",
  navRentals: "الإيجارات",
  navProfile: "حسابي",
  navSearch: "البحث",
  navTrending: "الأكثر تفاعلاً",
  navExplore: "استكشف",
  searchPlaceholder: "ابحث عن قصص، مستخدمين، كتب…",
  searchLabel: "البحث في الحكاوي",
  createStory: "اكتب قصة",
  writeSomething: "اكتب حكايتك هنا…",
  signOut: "تسجيل الخروج",
  themeLabel: "تبديل المظهر",
  themeToLight: "الوضع الفاتح",
  themeToDark: "الوضع الداكن",
  languageLabel: "تبديل اللغة",
  menuLabel: "القائمة",
  trendingTitle: "الأكثر تفاعلاً",
  trendingEmpty: "لا توجد قصص بعد.",
  mainNavigation: "التنقل الرئيسي",
  secondaryNavigation: "روابط جانبية",
  skipToContent: "تخطَّ إلى المحتوى",
};

const ENGLISH: ShellStrings = {
  brand: "Hakawi",
  brandFull: "Hakawi — the storytelling platform",
  tagline: "Write your story, and read everyone else's",
  navHome: "Home",
  navStories: "Stories",
  navBooks: "Books",
  navLibrary: "My Library",
  navContests: "Contests",
  navMessages: "Messages",
  navNotifications: "Notifications",
  navPayments: "Payments",
  navRentals: "Rentals",
  navProfile: "Profile",
  navSearch: "Search",
  navTrending: "Trending",
  navExplore: "Explore",
  searchPlaceholder: "Search stories, people, books…",
  searchLabel: "Search Hakawi",
  createStory: "Write a story",
  writeSomething: "Write your story here…",
  signOut: "Sign out",
  themeLabel: "Switch theme",
  themeToLight: "Light mode",
  themeToDark: "Dark mode",
  languageLabel: "Switch language",
  menuLabel: "Menu",
  trendingTitle: "Trending",
  trendingEmpty: "No stories yet.",
  mainNavigation: "Main navigation",
  secondaryNavigation: "Sidebar links",
  skipToContent: "Skip to content",
};

const DICTIONARIES: Record<Locale, ShellStrings> = { ar: ARABIC, en: ENGLISH };

/** Arabic strings are always Arabic-Indic free — the product uses Western digits. */
export function shellStrings(locale: Locale): ShellStrings {
  return DICTIONARIES[locale];
}

/** `ar-EG` and `en-GB`, for `Intl` and `toLocaleDateString`. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG" : "en-GB";
}
