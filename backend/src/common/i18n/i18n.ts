export type Locale = 'ar' | 'en';

export const DEFAULT_LOCALE: Locale = 'ar';

export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'ar';
}

const DICT: Record<Locale, Record<string, string>> = {
  ar: {
    'badge.earned.title': 'تم الحصول على شارة: {name}',
    'badge.earned.message': '{description}',
    'follow.title': 'متابع جديد',
    'follow.message': 'بدأ شخص ما بمتابعتك.',
    'comment.title': 'تعليق جديد على قصتك',
    'comment.message': 'علّق شخص ما على قصتك.',
    'comment_reply.title': 'رد جديد على تعليقك',
    'comment_reply.message': 'رد شخص ما على أحد تعليقاتك.',
    'story_reaction.title': 'تفاعل جديد مع قصتك',
    'story_reaction.message': 'تفاعل شخص ما مع قصتك.',
    'comment_reaction.title': 'تفاعل جديد مع تعليقك',
    'comment_reaction.message': 'تفاعل شخص ما مع أحد تعليقاتك.',
    'message.title': 'رسالة جديدة',
    'message.message': 'لقد تلقيت رسالة مباشرة جديدة.',
    'user.upgraded.title': 'ترقية الحساب',
    'upgrade.rising_star': 'أصبح حسابك الآن "كاتب ناشئ". يمكنك الآن كتابة القصص، الوصول للتحليلات الكاملة، والتواصل مع دور النشر.',
    'upgrade.professional': 'تهانينا! أصبح حسابك الآن "كاتب محترف". يمكنك الآن بيع كتبك الخاصة والاستفادة من جميع ميزات الكتّاب المحترفين.',
    'upgrade.publisher': 'تم ترقية حسابك إلى "دار نشر". يمكنك الآن إنشاء وإدارة المسابقات، وبيع كتب الكتّاب الممثلين.',
    'upgrade.default': 'تم ترقية حسابك.',
    'contest.submission.submitted.title': 'تم إرسال قصتك',
    'contest.submission.submitted.message': 'مشاركتك في انتظار المراجعة.',
    'contest.submission.approved.title': 'تم قبول مشاركتك',
    'contest.submission.approved.message': 'قصتك الآن في المنافسة.',
    'contest.submission.rejected.title': 'لم يتم قبول مشاركتك',
    'contest.submission.rejected.message': 'هذه المرة لم تدخل المنافسة.',
    'contest.vote.title': 'حصلت قصتك على تصويت',
    'contest.vote.message': 'صوّت شخص ما لمشاركتك.',
    'contest.winner.title': 'تهانينا — لقد فزت',
    'contest.winner.message': 'حصلت مشاركتك على المركز الأول.',
    'contest.started.title': 'بدأت مسابقتك',
    'contest.started.message': 'التصويت مفتوح الآن.',
    'contest.prize.title': 'تم إرسال جائزتك',
    'contest.prize.message': 'تم إرسال جائزتك.',
  },
  en: {
    'badge.earned.title': 'Badge earned: {name}',
    'badge.earned.message': '{description}',
    'follow.title': 'New follower',
    'follow.message': 'Someone started following you.',
    'comment.title': 'New comment on your story',
    'comment.message': 'Someone commented on your story.',
    'comment_reply.title': 'New reply to your comment',
    'comment_reply.message': 'Someone replied to one of your comments.',
    'story_reaction.title': 'New reaction to your story',
    'story_reaction.message': 'Someone reacted to your story.',
    'comment_reaction.title': 'New reaction to your comment',
    'comment_reaction.message': 'Someone reacted to one of your comments.',
    'message.title': 'New message',
    'message.message': 'You have a new direct message.',
    'user.upgraded.title': 'Account upgraded',
    'upgrade.rising_star': 'Your account is now "Rising Star". You can now write stories, access full analytics, and connect with publishers.',
    'upgrade.professional': 'Congratulations! Your account is now "Professional". You can now sell your own books and use all professional writer features.',
    'upgrade.publisher': 'Your account has been upgraded to "Publisher". You can now create and manage contests and sell books of represented writers.',
    'upgrade.default': 'Your account has been upgraded.',
    'contest.submission.submitted.title': 'Your story was submitted',
    'contest.submission.submitted.message': 'Your entry is awaiting review.',
    'contest.submission.approved.title': 'Your entry was approved',
    'contest.submission.approved.message': 'Your story is now in the running.',
    'contest.submission.rejected.title': 'Your entry was not accepted',
    'contest.submission.rejected.message': 'This time it did not make the running.',
    'contest.vote.title': 'Your story got a vote',
    'contest.vote.message': 'Someone voted for your entry.',
    'contest.winner.title': 'Congratulations — you won',
    'contest.winner.message': 'Your entry took first place.',
    'contest.started.title': 'Your contest has started',
    'contest.started.message': 'Voting is now open.',
    'contest.prize.title': 'Your prize',
    'contest.prize.message': 'Your prize has been sent.',
  },
};

export function t(key: string, locale: Locale, params?: Record<string, string>): string {
  const template = DICT[locale]?.[key] ?? DICT.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? '');
}

const BADGE_NAMES: Record<Locale, Record<string, string>> = {
  ar: {
    'contest-champion': 'بطل المسابقة',
    'contest-legend': 'أسطورة المسابقات',
    'first-publication': 'أول نشر',
    'prolific-author': 'كاتب غزير',
    'rising-author': 'كاتب صاعد',
    'community-pillar': 'ركيزة المجتمع',
    'guardian': 'حارس',
    'steward': 'أمين',
  },
  en: {},
};

const BADGE_DESCRIPTIONS: Record<Locale, Record<string, string>> = {
  ar: {
    'contest-champion': 'فاز في مسابقة كتابة',
    'contest-legend': 'فاز في ثلاث مسابقات كتابة',
    'first-publication': 'نشر قصته الأولى',
    'prolific-author': 'نشر خمس قصص',
    'rising-author': 'حصل على عشرة متابعين',
    'community-pillar': 'حصل على مئة متابع',
    'guardian': 'اتخذ إجراء إشرافياً أول',
    'steward': 'اتخذ عشرة إجراءات إشرافية',
  },
  en: {},
};

export function badgeName(locale: Locale, badgeKey: string, fallback: string): string {
  return BADGE_NAMES[locale]?.[badgeKey] ?? fallback;
}

export function badgeDescription(locale: Locale, badgeKey: string, fallback: string): string {
  return BADGE_DESCRIPTIONS[locale]?.[badgeKey] ?? fallback;
}
