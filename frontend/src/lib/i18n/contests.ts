import { countReadout, formatCount } from "./common";

/**
 * Contests: the list of competitions, one contest in full, and the publisher's
 * view of them.
 *
 * OWNED BY THE CONTESTS SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * THE STATUS WORDS LIVE HERE, NOT IN THE BADGE. `ContestStatusBadge` used to
 * carry its own table of Arabic labels, which meant the pill on a card and the
 * pill on a contest's own page could be edited separately and drift. The table is
 * keyed by the API's vocabulary (`CONTEST_STATUSES` in `@hakawi/shared-types`),
 * and a status the dictionary does not know falls through unchanged — a state
 * added tomorrow is displayed, not swallowed.
 */
export interface ContestsStrings {
  /* ---- the list ---- */
  listTitle: string;
  listDescription: string;
  listLoadFailed: string;
  emptyTitle: string;
  emptyDescription: string;
  /** The word that joins the two dates of a contest's period, for a screen reader. */
  dateRangeSeparator: string;

  /* ---- the status pill ---- */
  statusLabels: Record<string, string>;
  /** The status of an entry inside a contest, as the publisher's list shows it. */
  submissionStatusLabels: Record<string, string>;

  /* ---- one contest ---- */
  detailTitle: string;
  detailLoadFailed: string;
  detailNotFoundTitle: string;
  detailNotFoundMessage: string;
  detailsHeading: string;
  backToContests: string;
  factCategory: string;
  factStatus: string;
  factStartDate: string;
  factEndDate: string;
  factSubmissionDeadline: string;
  factWinner: string;
  submitHeading: string;
  storyIdLabel: string;
  storyIdPlaceholder: string;
  submitButton: string;
  submitSucceeded: string;
  submitFailed: string;
  votesHeading: string;
  votesEmpty: string;
  submissionIdLabel: (id: string) => string;
  voteCount: (count: number) => string;
  voteButton: string;
  voteSucceeded: string;
  voteFailed: string;
  ownerActionsHeading: string;
  selectWinnerHeading: string;
  winningSubmissionIdLabel: string;
  submissionIdPlaceholder: string;
  selectWinnerButton: string;
  selectWinnerSucceeded: string;
  selectWinnerFailed: string;
  distributePrizeHeading: string;
  prizeSubmissionIdLabel: string;
  prizeTypeLabel: string;
  prizeTypeCash: string;
  prizeTypeOther: string;
  prizeDescriptionLabel: string;
  prizeDescriptionPlaceholder: string;
  prizeAmountLabel: string;
  prizeAmountPlaceholder: string;
  prizeCurrencyLabel: string;
  prizeCurrencyPlaceholder: string;
  distributePrizeButton: string;
  distributePrizeSucceeded: string;
  distributePrizeFailed: string;

  /* ---- the publisher's dashboard ---- */
  publisherTitle: string;
  publisherDescription: string;
  publisherLoadFailed: string;
  publisherStatTotalContests: string;
  publisherStatActiveContests: string;
  publisherStatCompletedContests: string;
  publisherStatTotalSubmissions: string;
  publisherStatPendingSubmissions: string;
  publisherStatTotalVotes: string;
  publisherStatTotalPrizes: string;
  publisherTabOverview: string;
  publisherTabSubmissions: string;
  publisherTabVotes: string;
  publisherSubmissionsEmpty: string;
  publisherVotesEmpty: string;
  publisherSubmissionStoryId: (id: string) => string;
  publisherSubmissionStatus: (status: string) => string;
  publisherSubmissionVotes: (count: number) => string;
  publisherVoteSubmissionId: (id: string) => string;
  publisherVoteVoter: (id: string) => string;
}

export const AR: ContestsStrings = {
  listTitle: "المسابقات",
  listDescription: "اكتب قصتك، وشاركها في مسابقة، واقرأ أعمال الآخرين.",
  listLoadFailed: "تعذّر تحميل المسابقات",
  emptyTitle: "لا توجد مسابقات بعد",
  emptyDescription: "تابع الحكاوي ليصلك إشعار فور انطلاق المسابقة القادمة.",
  dateRangeSeparator: "إلى",

  statusLabels: {
    draft: "مسودة",
    active: "جارية",
    voting: "مرحلة التصويت",
    completed: "مكتملة",
    cancelled: "ملغاة",
  },
  submissionStatusLabels: {
    pending: "قيد المراجعة",
    approved: "مقبولة",
    rejected: "مرفوضة",
  },

  detailTitle: "المسابقة",
  detailLoadFailed: "تعذّر تحميل المسابقة",
  detailNotFoundTitle: "لا توجد مسابقة بهذا المعرّف",
  detailNotFoundMessage: "المسابقة غير موجودة",
  detailsHeading: "تفاصيل المسابقة",
  backToContests: "العودة إلى المسابقات",
  factCategory: "التصنيف",
  factStatus: "الحالة",
  factStartDate: "تاريخ البداية",
  factEndDate: "تاريخ النهاية",
  factSubmissionDeadline: "آخر موعد للمشاركة",
  factWinner: "الفائز",
  submitHeading: "شارك بمشاركتك",
  storyIdLabel: "معرّف القصة",
  storyIdPlaceholder: "أدخل معرّف القصة التي تريد تقديمها",
  submitButton: "إرسال المشاركة",
  submitSucceeded: "تم إرسال مشاركتك بنجاح",
  submitFailed: "تعذّر إرسال المشاركة",
  votesHeading: "الأصوات",
  votesEmpty: "لا توجد أصوات بعد.",
  submissionIdLabel: (id) => `معرّف المشاركة: ${id}`,
  voteCount: (count) => `${formatCount(count)} صوت`,
  voteButton: "صوت",
  voteSucceeded: "تم تسجيل صوتك",
  voteFailed: "تعذّر تسجيل الصوت",
  ownerActionsHeading: "إجراءات المالك",
  selectWinnerHeading: "اختيار الفائز",
  winningSubmissionIdLabel: "معرّف المشاركة الفائزة",
  submissionIdPlaceholder: "معرّف المشاركة",
  selectWinnerButton: "اختيار الفائز",
  selectWinnerSucceeded: "تم اختيار الفائز",
  selectWinnerFailed: "تعذّر اختيار الفائز",
  distributePrizeHeading: "توزيع الجائزة",
  prizeSubmissionIdLabel: "معرّف المشاركة",
  prizeTypeLabel: "نوع الجائزة",
  prizeTypeCash: "نقدي",
  prizeTypeOther: "أخرى",
  prizeDescriptionLabel: "وصف الجائزة",
  prizeDescriptionPlaceholder: "وصف الجائزة",
  prizeAmountLabel: "المبلغ (بالقرش)",
  prizeAmountPlaceholder: "5000",
  prizeCurrencyLabel: "العملة",
  prizeCurrencyPlaceholder: "EGP",
  distributePrizeButton: "توزيع الجائزة",
  distributePrizeSucceeded: "تم توزيع الجائزة",
  distributePrizeFailed: "تعذّر توزيع الجائزة",

  publisherTitle: "لوحة الناشر",
  publisherDescription: "نظرة عامة على مسابقاتك ومشاركاتها.",
  publisherLoadFailed: "فشل تحميل لوحة الناشر",
  publisherStatTotalContests: "إجمالي المسابقات",
  publisherStatActiveContests: "المسابقات النشطة",
  publisherStatCompletedContests: "المسابقات المكتملة",
  publisherStatTotalSubmissions: "إجمالي المشاركات",
  publisherStatPendingSubmissions: "المشاركات المعلّقة",
  publisherStatTotalVotes: "إجمالي الأصوات",
  publisherStatTotalPrizes: "إجمالي الجوائز",
  publisherTabOverview: "نظرة عامة",
  publisherTabSubmissions: "المشاركات",
  publisherTabVotes: "الأصوات",
  publisherSubmissionsEmpty: "لا توجد مشاركات بعد.",
  publisherVotesEmpty: "لا توجد أصوات بعد.",
  publisherSubmissionStoryId: (id) => `معرّف القصة: ${id}`,
  publisherSubmissionStatus: (status) => `الحالة: ${status}`,
  publisherSubmissionVotes: (count) => `الأصوات: ${formatCount(count)}`,
  publisherVoteSubmissionId: (id) => `معرّف المشاركة: ${id}`,
  publisherVoteVoter: (id) => `الناخب: ${id}`,
};

export const EN: ContestsStrings = {
  listTitle: "Contests",
  listDescription: "Write your story, enter it in a contest, and read what others wrote.",
  listLoadFailed: "Couldn't load the contests",
  emptyTitle: "No contests yet",
  emptyDescription: "Follow the writers and you'll be notified the moment the next contest opens.",
  dateRangeSeparator: "to",

  statusLabels: {
    draft: "Draft",
    active: "Live",
    voting: "Voting",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  submissionStatusLabels: {
    pending: "Under review",
    approved: "Accepted",
    rejected: "Rejected",
  },

  detailTitle: "Contest",
  detailLoadFailed: "Couldn't load the contest",
  detailNotFoundTitle: "No contest with this id",
  detailNotFoundMessage: "This contest doesn't exist.",
  detailsHeading: "Contest details",
  backToContests: "Back to contests",
  factCategory: "Category",
  factStatus: "Status",
  factStartDate: "Starts on",
  factEndDate: "Ends on",
  factSubmissionDeadline: "Entry deadline",
  factWinner: "Winner",
  submitHeading: "Enter your story",
  storyIdLabel: "Story id",
  storyIdPlaceholder: "Enter the id of the story you want to enter",
  submitButton: "Submit entry",
  submitSucceeded: "Your entry was submitted",
  submitFailed: "Couldn't submit the entry",
  votesHeading: "Votes",
  votesEmpty: "No votes yet.",
  submissionIdLabel: (id) => `Entry id: ${id}`,
  voteCount: (count) => {
    const readout = countReadout(count, "en", { one: "vote", other: "votes" });
    return `${readout.count} ${readout.label}`;
  },
  voteButton: "Vote",
  voteSucceeded: "Your vote was recorded",
  voteFailed: "Couldn't record your vote",
  ownerActionsHeading: "Owner actions",
  selectWinnerHeading: "Choose the winner",
  winningSubmissionIdLabel: "Winning entry id",
  submissionIdPlaceholder: "Entry id",
  selectWinnerButton: "Choose the winner",
  selectWinnerSucceeded: "The winner was chosen",
  selectWinnerFailed: "Couldn't choose the winner",
  distributePrizeHeading: "Distribute the prize",
  prizeSubmissionIdLabel: "Entry id",
  prizeTypeLabel: "Prize type",
  prizeTypeCash: "Cash",
  prizeTypeOther: "Other",
  prizeDescriptionLabel: "Prize description",
  prizeDescriptionPlaceholder: "Prize description",
  prizeAmountLabel: "Amount (in piastres)",
  prizeAmountPlaceholder: "5000",
  prizeCurrencyLabel: "Currency",
  prizeCurrencyPlaceholder: "EGP",
  distributePrizeButton: "Distribute the prize",
  distributePrizeSucceeded: "The prize was distributed",
  distributePrizeFailed: "Couldn't distribute the prize",

  publisherTitle: "Publisher dashboard",
  publisherDescription: "An overview of your contests and their entries.",
  publisherLoadFailed: "Couldn't load the publisher dashboard",
  publisherStatTotalContests: "Total contests",
  publisherStatActiveContests: "Live contests",
  publisherStatCompletedContests: "Completed contests",
  publisherStatTotalSubmissions: "Total entries",
  publisherStatPendingSubmissions: "Pending entries",
  publisherStatTotalVotes: "Total votes",
  publisherStatTotalPrizes: "Total prizes",
  publisherTabOverview: "Overview",
  publisherTabSubmissions: "Entries",
  publisherTabVotes: "Votes",
  publisherSubmissionsEmpty: "No entries yet.",
  publisherVotesEmpty: "No votes yet.",
  publisherSubmissionStoryId: (id) => `Story id: ${id}`,
  publisherSubmissionStatus: (status) => `Status: ${status}`,
  publisherSubmissionVotes: (count) => `Votes: ${formatCount(count)}`,
  publisherVoteSubmissionId: (id) => `Entry id: ${id}`,
  publisherVoteVoter: (id) => `Voter: ${id}`,
};
