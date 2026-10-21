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

/**
 * WHY A REASON IS A KEY AND TWO NUMBERS AND NOT A SENTENCE.
 *
 * The helper used to build the reason an account is not yet eligible in Arabic
 * inside the client — "قصص منشورة: 3/5" — so the sentence stayed Arabic in
 * every locale, and the same fact had to be re-worded in every dictionary that
 * wanted to show it. The helper now returns WHAT IT KNOWS: which metric is
 * short, how far along the reader is and the threshold to reach. The dictionary
 * (`lib/i18n/profile.ts`) writes the sentence, in the reader's language.
 */
export type ProfessionalProgressReason =
  | {
      kind: "count";
      metric: "stories" | "views" | "reactions" | "followers";
      current: number;
      threshold: number;
    }
  | { kind: "verified" };

export interface ProfessionalProgress {
  storiesCount: { current: number; threshold: number; percent: number; met: boolean };
  totalViews: { current: number; threshold: number; percent: number; met: boolean };
  totalReactions: { current: number; threshold: number; percent: number; met: boolean };
  followersCount: { current: number; threshold: number; percent: number; met: boolean };
  isVerified: { met: boolean };
  eligible: boolean;
  reasons: ProfessionalProgressReason[];
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

  const storiesMet = storiesCurrent >= storiesThreshold;
  const viewsMet = viewsCurrent >= viewsThreshold;
  const reactionsMet = reactionsCurrent >= reactionsThreshold;
  const followersMet = followersCurrent >= followersThreshold;
  const verifiedMet = user.isVerified === true;

  const reasons: ProfessionalProgressReason[] = [];
  if (!storiesMet) reasons.push({ kind: "count", metric: "stories", current: storiesCurrent, threshold: storiesThreshold });
  if (!viewsMet) reasons.push({ kind: "count", metric: "views", current: viewsCurrent, threshold: viewsThreshold });
  if (!reactionsMet) reasons.push({ kind: "count", metric: "reactions", current: reactionsCurrent, threshold: reactionsThreshold });
  if (!followersMet) reasons.push({ kind: "count", metric: "followers", current: followersCurrent, threshold: followersThreshold });
  if (!verifiedMet) reasons.push({ kind: "verified" });

  return {
    storiesCount: { current: storiesCurrent, threshold: storiesThreshold, percent: Math.min(storiesCurrent / storiesThreshold, 1) * 100, met: storiesMet },
    totalViews: { current: viewsCurrent, threshold: viewsThreshold, percent: Math.min(viewsCurrent / viewsThreshold, 1) * 100, met: viewsMet },
    totalReactions: { current: reactionsCurrent, threshold: reactionsThreshold, percent: Math.min(reactionsCurrent / reactionsThreshold, 1) * 100, met: reactionsMet },
    followersCount: { current: followersCurrent, threshold: followersThreshold, percent: Math.min(followersCurrent / followersThreshold, 1) * 100, met: followersMet },
    isVerified: { met: verifiedMet },
    eligible: storiesMet && viewsMet && reactionsMet && followersMet && verifiedMet,
    reasons,
  };
}
