import { formatCount } from "./common";

/**
 * The reader's own account: the profile, the editor, the badges and the
 * professional-progress checklist.
 *
 * OWNED BY THE PROFILE SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * THE CHECKLIST SAYS ITS SENTENCES HERE, NOT IN THE HELPER. `lib/account.ts`
 * used to build the reasons an account is not yet eligible in Arabic, inside the
 * client; it now returns the KEY and the NUMBERS, and this table writes the
 * sentence in the reader's language.
 */
export interface ProfileStrings {
  /* ---- the profile ---- */
  profileTitle: string;
  profileEditButton: string;
  profileNotFound: string;
  profileLoadFailed: string;
  profileNoBio: string;
  accountTypeLabels: Record<string, string>;
  statStories: string;
  statFollowers: string;
  statFollowing: string;

  /* ---- the editor ---- */
  editTitle: string;
  editDescription: string;
  editNameLabel: string;
  editBioLabel: string;
  editBioPlaceholder: string;
  editSaveButton: string;
  editCancelButton: string;
  editSaveFailed: string;

  /* ---- the professional-progress checklist ---- */
  upgradeHeading: string;
  upgradeDescription: string;
  upgradeButton: string;
  upgradeRequested: string;
  upgradeNotEligible: string;
  upgradeFailed: string;
  progressLabels: {
    stories: string;
    views: string;
    reactions: string;
    followers: string;
    verified: string;
  };
  progressReasons: {
    stories: (current: number, threshold: number) => string;
    views: (current: number, threshold: number) => string;
    reactions: (current: number, threshold: number) => string;
    followers: (current: number, threshold: number) => string;
    verified: string;
  };

  /* ---- the badges ---- */
  badgesTitle: string;
  badgesDescription: string;
  badgesLoadFailed: string;
  badgesEmpty: string;
  badgeThresholdLabel: (threshold: number) => string;
  /** The pill on a badge the reader has already earned. */
  badgeEarned: string;
}

export const AR: ProfileStrings = {
  profileTitle: "الملف الشخصي",
  profileEditButton: "تعديل الملف الشخصي",
  profileNotFound: "المستخدم غير موجود",
  profileLoadFailed: "فشل تحميل الملف الشخصي",
  profileNoBio: "لا توجد نبذة شخصية بعد",
  accountTypeLabels: {
    reader: "قارئ",
    writer: "كاتب",
    rising_star: "كاتب ناشئ",
    professional: "كاتب محترف",
    publisher: "دار نشر",
    admin: "مدير النظام",
  },
  statStories: "قصة",
  statFollowers: "متابع",
  statFollowing: "متابَع",

  editTitle: "تعديل الملف الشخصي",
  editDescription: "الاسم والنبذة هما ما يراه القراء على قصصك",
  editNameLabel: "الاسم الكامل",
  editBioLabel: "النبذة الشخصية",
  editBioPlaceholder: "أخبرنا عن نفسك...",
  editSaveButton: "حفظ التغييرات",
  editCancelButton: "إلغاء",
  editSaveFailed: "فشل تحديث الملف الشخصي",

  upgradeHeading: "الترقية إلى كاتب محترف",
  upgradeDescription:
    "حقق العتبات التالية لترقية حسابك إلى «كاتب محترف» (يُمكّنك من بيع الكتب والتحليلات الكاملة):",
  upgradeButton: "طلب الترقية إلى كاتب محترف",
  upgradeRequested: "أنت مؤهل للترقية! تم إرسال طلبك للمراجعة من قبل موظف التحقق.",
  upgradeNotEligible: "غير مؤهل بعد:",
  upgradeFailed: "فشل طلب الترقية",
  progressLabels: {
    stories: "قصص منشورة",
    views: "مشاهدات القصص",
    reactions: "تفاعلات القصص",
    followers: "متابعون",
    verified: "بريد إلكتروني مؤكد",
  },
  progressReasons: {
    stories: (current, threshold) => `قصص منشورة: ${formatCount(current)}/${formatCount(threshold)}`,
    views: (current, threshold) => `مشاهدات: ${formatCount(current)}/${formatCount(threshold)}`,
    reactions: (current, threshold) => `تفاعلات: ${formatCount(current)}/${formatCount(threshold)}`,
    followers: (current, threshold) => `متابعين: ${formatCount(current)}/${formatCount(threshold)}`,
    verified: "البريد الإلكتروني غير مؤكد",
  },

  badgesTitle: "الشارات",
  badgesDescription: "اكتشف الشارات التي يمكنك كسبها من خلال التفاعل مع حكاوي.",
  badgesLoadFailed: "فشل تحميل الشارات",
  badgesEmpty: "لا توجد شارات بعد.",
  badgeThresholdLabel: (threshold) => `الحد: ${formatCount(threshold)}`,
  badgeEarned: "مكتسبة",
};

export const EN: ProfileStrings = {
  profileTitle: "Profile",
  profileEditButton: "Edit profile",
  profileNotFound: "This reader doesn't exist",
  profileLoadFailed: "Couldn't load the profile",
  profileNoBio: "No bio yet",
  accountTypeLabels: {
    reader: "Reader",
    writer: "Writer",
    rising_star: "Rising writer",
    professional: "Professional writer",
    publisher: "Publisher",
    admin: "Administrator",
  },
  statStories: "Stories",
  statFollowers: "Followers",
  statFollowing: "Following",

  editTitle: "Edit profile",
  editDescription: "Your name and bio are what readers see on your stories",
  editNameLabel: "Full name",
  editBioLabel: "Bio",
  editBioPlaceholder: "Tell us about yourself...",
  editSaveButton: "Save changes",
  editCancelButton: "Cancel",
  editSaveFailed: "Couldn't update the profile",

  upgradeHeading: "Upgrade to professional writer",
  upgradeDescription:
    "Meet the thresholds below to upgrade your account to a “professional writer” (which lets you sell books and full analyses):",
  upgradeButton: "Request the upgrade",
  upgradeRequested: "You're eligible! Your request was sent to a verification officer for review.",
  upgradeNotEligible: "Not eligible yet:",
  upgradeFailed: "Couldn't request the upgrade",
  progressLabels: {
    stories: "Published stories",
    views: "Story views",
    reactions: "Story reactions",
    followers: "Followers",
    verified: "Verified email",
  },
  progressReasons: {
    stories: (current, threshold) => `Published stories: ${formatCount(current)}/${formatCount(threshold)}`,
    views: (current, threshold) => `Views: ${formatCount(current)}/${formatCount(threshold)}`,
    reactions: (current, threshold) => `Reactions: ${formatCount(current)}/${formatCount(threshold)}`,
    followers: (current, threshold) => `Followers: ${formatCount(current)}/${formatCount(threshold)}`,
    verified: "The email address isn't verified",
  },

  badgesTitle: "Badges",
  badgesDescription: "Discover the badges you can earn by engaging with the stories.",
  badgesLoadFailed: "Couldn't load the badges",
  badgesEmpty: "No badges yet.",
  badgeThresholdLabel: (threshold) => `Threshold: ${formatCount(threshold)}`,
  badgeEarned: "Earned",
};
