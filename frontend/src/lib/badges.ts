import type { Locale } from "@/lib/preferences";

const BADGE_NAMES: Record<Locale, Record<string, string>> = {
  ar: {
    "contest-champion": "بطل المسابقة",
    "contest-legend": "أسطورة المسابقات",
    "first-publication": "أول منشور",
    "prolific-author": "كاتب غزير",
    "rising-author": "كاتب صاعد",
    "community-pillar": "ركيزة المجتمع",
    guardian: "حارس",
    steward: "أمين",
  },
  en: {
    "contest-champion": "Contest Champion",
    "contest-legend": "Contest Legend",
    "first-publication": "First Publication",
    "prolific-author": "Prolific Author",
    "rising-author": "Rising Author",
    "community-pillar": "Community Pillar",
    guardian: "Guardian",
    steward: "Steward",
  },
};

const BADGE_DESCRIPTIONS: Record<Locale, Record<string, string>> = {
  ar: {
    "contest-champion": "فاز في مسابقة كتابة",
    "contest-legend": "فاز في ثلاث مسابقات كتابة",
    "first-publication": "نشر قصته الأولى",
    "prolific-author": "نشر خمس قصص",
    "rising-author": "حصل على عشرة متابعين",
    "community-pillar": "حصل على مئة متابع",
    guardian: "اتخذ إجراء إشرافياً أول",
    steward: "اتخذ عشرة إجراءات إشرافية",
  },
  en: {
    "contest-champion": "Won a writing contest",
    "contest-legend": "Won three writing contests",
    "first-publication": "Published a first story",
    "prolific-author": "Published five stories",
    "rising-author": "Gained ten followers",
    "community-pillar": "Gained one hundred followers",
    guardian: "Took a first moderation action",
    steward: "Took ten moderation actions",
  },
};

const BADGE_EARNED_PREFIX: Record<Locale, string> = {
  ar: "تم الحصول على شارة:",
  en: "Badge earned:",
};

export function badgeNotificationCopy(
  locale: Locale,
  badgeKey: string,
): { title: string; message: string } {
  const name = BADGE_NAMES[locale]?.[badgeKey] ?? BADGE_NAMES.en[badgeKey] ?? badgeKey;
  const description = BADGE_DESCRIPTIONS[locale]?.[badgeKey] ?? BADGE_DESCRIPTIONS.en[badgeKey] ?? "";
  return {
    title: `${BADGE_EARNED_PREFIX[locale]} ${name}`,
    message: description,
  };
}