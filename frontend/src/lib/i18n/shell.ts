/**
 * Shell copy — the chrome (navigation, header, bottom bar, wordmark) — in both
 * locales.
 *
 * SCOPE, STATED PLAINLY: this is the chrome the shell itself owns, plus the
 * search surface's copy, and the auth flows, the story readouts and the story
 * create/edit forms — those live beside it in the sibling tables. Authored
 * content — a story body, a contest brief, the prose a reader writes in a
 * comment — is Arabic by definition and is not translated here, and the
 * remaining page surfaces (the dashboard, contests, payments, rentals,
 * moderation, notifications, the profile pages and the row components) still
 * carry Arabic literals that a later pass moves into these tables. The table is
 * therefore not a promise that every string a reader sees has an English twin;
 * it is the guarantee that the navigation, the header and the locale's own
 * controls do.
 *
 * The brand wordmark follows the locale: `حكاوي` in Arabic and its Latin
 * transliteration `Hakawi` in English, because a name is still read aloud by
 * the screen reader in the reader's language. The design system documents the
 * reversed-`ح` mark the Arabic wordmark pairs with.
 */
export interface ShellStrings {
  brand: string;
  tagline: string;
  appTitle: string;
  appDescription: string;
  navHome: string;
  navStories: string;
  navBooks: string;
  navLibrary: string;
  navContests: string;
  navMessages: string;
  navNotifications: string;
  /** The word a screen reader reads for an unread counter. */
  unreadMessagesLabel: string;
  unreadNotificationsLabel: string;
  navPayments: string;
  navRentals: string;
  navProfile: string;
  navAdmin: string;
  navSearch: string;
  searchPlaceholder: string;
  searchLabel: string;
  searchDescription: string;
  searchIdleDescription: string;
  searching: string;
  searchFailed: string;
  noMatchesTitle: string;
  noMatchesDescription: string;
  /**
   * The starter words the idle search offers. Copy, not configuration: each one
   * is a term the search endpoint can actually answer, so the dictionary owns
   * them the way it owns every other word on the screen.
   */
  searchSuggestions: string[];
  createStory: string;
  writeSomething: string;
  signOut: string;
  themeLabel: string;
  themeToLight: string;
  themeToDark: string;
  languageLabel: string;
  languageArabic: string;
  languageEnglish: string;
  trendingTitle: string;
  noStories: string;
  mainNavigation: string;
  bottomNavigation: string;
  secondaryNavigation: string;
  trendingRailLabel: string;
  skipToContent: string;
}

export const AR: ShellStrings = {
  brand: "حكاوي",
  tagline: "اكتب حكايتك، واقرأ حكايات غيرك",
  appTitle: "حكاوي",
  appDescription: "منصة الحكاوي للكتابة والقراءة",
  navHome: "الرئيسية",
  navStories: "القصص",
  navBooks: "الكتب",
  navLibrary: "مكتبتي",
  navContests: "المسابقات",
  navMessages: "الرسائل",
  navNotifications: "الإشعارات",
  unreadMessagesLabel: "رسائل غير مقروءة",
  unreadNotificationsLabel: "إشعارات غير مقروءة",
  navPayments: "المدفوعات",
  navRentals: "الإيجارات",
  navProfile: "حسابي",
  navAdmin: "لوحة المسؤول",
  navSearch: "البحث",
  searchPlaceholder: "ابحث عن قصص، مستخدمين، كتب…",
  searchLabel: "البحث في الحكاوي",
  searchDescription: "ابحث في القصص والكتب والكتّاب.",
  searchIdleDescription: "اكتب كلمة في الحقل أعلاه، ثم اضغط Enter للبحث.",
  searching: "جاري البحث…",
  searchFailed: "تعذّر إتمام البحث",
  noMatchesTitle: "لم نجد ما يطابق بحثك",
  noMatchesDescription: "جرّب كلمات أخرى، أو ابدأ من أحد هذه الاقتراحات:",
  searchSuggestions: ["رعب", "واقعي", "أساطير"],
  createStory: "اكتب قصة",
  writeSomething: "اكتب حكايتك هنا…",
  signOut: "تسجيل الخروج",
  themeLabel: "تبديل المظهر",
  themeToLight: "الوضع الفاتح",
  themeToDark: "الوضع الداكن",
  languageLabel: "تبديل اللغة",
  languageArabic: "العربية",
  languageEnglish: "الإنجليزية",
  trendingTitle: "الأكثر تفاعلاً",
  noStories: "لا توجد قصص بعد.",
  mainNavigation: "التنقل الرئيسي",
  // The bottom bar carries the same destinations as the sidebar, so it needs its
  // own name: two `navigation` landmarks that resolve to one label are
  // indistinguishable to a screen reader, which is the rule
  // `TrendingRail.tsx` states for the rail.
  bottomNavigation: "التنقل السفلي",
  secondaryNavigation: "روابط جانبية",
  trendingRailLabel: "استكشاف",
  skipToContent: "تخطَّ إلى المحتوى",
};

export const EN: ShellStrings = {
  brand: "Hakawi",
  tagline: "Write your story, and read everyone else's",
  appTitle: "Hakawi",
  appDescription: "Hakawi — the platform for writing and reading stories",
  navHome: "Home",
  navStories: "Stories",
  navBooks: "Books",
  navLibrary: "My Library",
  navContests: "Contests",
  navMessages: "Messages",
  navNotifications: "Notifications",
  unreadMessagesLabel: "unread messages",
  unreadNotificationsLabel: "unread notifications",
  navPayments: "Payments",
  navRentals: "Rentals",
  navProfile: "Profile",
  navAdmin: "Admin panel",
  navSearch: "Search",
  searchPlaceholder: "Search stories, people, books…",
  searchLabel: "Search Hakawi",
  searchDescription: "Search stories, books, and writers.",
  searchIdleDescription: "Type a word in the field above, then press Enter to search.",
  searching: "Searching…",
  searchFailed: "Search failed",
  noMatchesTitle: "No matches for your search",
  noMatchesDescription: "Try different words, or start from one of these suggestions:",
  searchSuggestions: ["Horror", "Realism", "Myths"],
  createStory: "Write a story",
  writeSomething: "Write your story here…",
  signOut: "Sign out",
  themeLabel: "Switch theme",
  themeToLight: "Light mode",
  themeToDark: "Dark mode",
  languageLabel: "Switch language",
  languageArabic: "العربية",
  languageEnglish: "English",
  trendingTitle: "Trending",
  noStories: "No stories yet.",
  mainNavigation: "Main navigation",
  bottomNavigation: "Bottom navigation",
  secondaryNavigation: "Sidebar links",
  trendingRailLabel: "Explore",
  skipToContent: "Skip to content",
};
