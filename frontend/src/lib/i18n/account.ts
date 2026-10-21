import type { AccountCapability } from "@/lib/account";

/**
 * Account roles and the copy that names them.
 *
 * WHY THIS TABLE IS HERE AND NOT IN `lib/account.ts`. `lib/account.ts` decides
 * whether an account MAY do something — `can(accountType, capability)` — and
 * that is a rule about the product. What the capability is CALLED is copy, and
 * copy belongs in the dictionary: the label used to be an Arabic literal inside
 * a TypeScript module, so `RequireAccount` rendered "لا يمكنك الوصول إلى هذه
 * الصفحة / يتطلب هذا الإجراء دوراً أعلى" inside an interface the reader had
 * just switched to English. Half an interface in one language is worse than
 * none.
 *
 * The capability KEYS are the contract — they are the same identifiers
 * `CAPABILITY_MIN_ACCOUNT` is keyed by — and only the LABELS are translated.
 */
export interface AccountStrings {
  /** The name of each capability, in the reader's language. */
  capabilityLabels: Record<AccountCapability, string>;
  /** The heading of the panel that replaces a capability the reader lacks. */
  restrictedTitle: string;
  /** The sentence that says what is needed, with the capability named. */
  restrictedBody: (capability: string) => string;
  /** The link that offers the upgrade path. */
  upgradeLink: string;
}

export const AR: AccountStrings = {
  capabilityLabels: {
    writeStories: "كتابة القصص",
    fullAnalytics: "التحليلات الكاملة",
    sellBooks: "بيع الكتب",
    communicateWithPublishers: "التواصل مع دور النشر",
    createContests: "إنشاء المسابقات",
    sellRepresentedBooks: "بيع كتب الكتّاب الموكلين",
  },
  restrictedTitle: "لا يمكنك الوصول إلى هذه الصفحة",
  restrictedBody: (capability) => `يتطلب هذا الإجراء دوراً أعلى: ${capability}.`,
  upgradeLink: "الانتقال إلى الترقية",
};

export const EN: AccountStrings = {
  capabilityLabels: {
    writeStories: "writing stories",
    fullAnalytics: "full analytics",
    sellBooks: "selling books",
    communicateWithPublishers: "talking to publishers",
    createContests: "creating contests",
    sellRepresentedBooks: "selling represented books",
  },
  restrictedTitle: "You can't open this page",
  restrictedBody: (capability) => `This action needs a higher role: ${capability}.`,
  upgradeLink: "Go to the upgrade page",
};
