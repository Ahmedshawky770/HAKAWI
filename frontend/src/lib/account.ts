import { accountTypeAtLeast, isAccountType, AccountType, type PublicUserProfile, type UserStats } from "@hakawi/shared-types";

export type AccountCapability =
  | "writeStories"
  | "fullAnalytics"
  | "sellBooks"
  | "communicateWithPublishers"
  | "createContests"
  | "sellRepresentedBooks";

const CAPABILITY_MIN_ACCOUNT: Readonly<Record<AccountCapability, AccountType>> = {
  writeStories: AccountType.READER,
  fullAnalytics: AccountType.RISING_STAR,
  sellBooks: AccountType.PROFESSIONAL,
  communicateWithPublishers: AccountType.RISING_STAR,
  createContests: AccountType.PUBLISHER,
  sellRepresentedBooks: AccountType.PUBLISHER,
};

export function can(accountType: string | null | undefined, capability: AccountCapability): boolean {
  if (!accountType || !isAccountType(accountType)) {
    return false;
  }
  return accountTypeAtLeast(accountType, CAPABILITY_MIN_ACCOUNT[capability]);
}

export interface ProfessionalProgress {
  storiesCount: { current: number; threshold: number; percent: number; met: boolean };
  totalViews: { current: number; threshold: number; percent: number; met: boolean };
  totalReactions: { current: number; threshold: number; percent: number; met: boolean };
  followersCount: { current: number; threshold: number; percent: number; met: boolean };
  isVerified: { met: boolean };
  eligible: boolean;
  reasons: string[];
}

export function professionalProgress(user: PublicUserProfile, stats: UserStats | null): ProfessionalProgress {
  const storiesThreshold = 5;
  const viewsThreshold = 1000;
  const reactionsThreshold = 100;
  const followersThreshold = 50;

  const storiesCurrent = stats?.storiesCount ?? 0;
  const viewsCurrent = stats?.totalViews ?? 0;
  const reactionsCurrent = stats?.totalReactions ?? 0;
  const followersCurrent = stats?.followersCount ?? 0;

  const storiesMet = storiesCurrent >= 5;
  const viewsMet = viewsCurrent >= 1000;
  const reactionsMet = reactionsCurrent >= 100;
  const followersMet = followersCurrent >= 50;
  const verifiedMet = user.isVerified === true;

  const reasons: string[] = [];
  if (!storiesMet) reasons.push(`قصص منشورة: ${storiesCurrent}/5`);
  if (!viewsMet) reasons.push(`مشاهدات: ${viewsCurrent}/1,000`);
  if (!reactionsMet) reasons.push(`تفاعلات: ${reactionsCurrent}/100`);
  if (!followersMet) reasons.push(`متابعين: ${followersCurrent}/50`);
  if (!verifiedMet) reasons.push('البريد الإلكتروني غير مؤكد');

  return {
    storiesCount: { current: storiesCurrent, threshold: storiesThreshold, percent: Math.min(storiesCurrent / 5, 1) * 100, met: storiesMet },
    totalViews: { current: viewsCurrent, threshold: viewsThreshold, percent: Math.min(viewsCurrent / 1000, 1) * 100, met: viewsMet },
    totalReactions: { current: reactionsCurrent, threshold: reactionsThreshold, percent: Math.min(reactionsCurrent / 100, 1) * 100, met: reactionsMet },
    followersCount: { current: followersCurrent, threshold: followersThreshold, percent: Math.min(followersCurrent / 50, 1) * 100, met: followersMet },
    isVerified: { met: verifiedMet },
    eligible: storiesMet && viewsMet && reactionsMet && followersMet && verifiedMet,
    reasons,
  };
}

export function capabilityLabel(capability: AccountCapability): string {
  const labels: Readonly<Record<AccountCapability, string>> = {
    writeStories: "كتابة القصص",
    fullAnalytics: "التحليلات الكاملة",
    sellBooks: "بيع الكتب",
    communicateWithPublishers: "التواصل مع دور النشر",
    createContests: "إنشاء المسابقات",
    sellRepresentedBooks: "بيع كتب الكتّاب الموكلين",
  };
  return labels[capability];
}
