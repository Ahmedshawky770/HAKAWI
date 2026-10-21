/**
 * Moderation: the report queue, the restrictions on an account, and the report
 * form a reader files.
 *
 * OWNED BY THE MODERATION SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * THE STATUS AND ACTION WORDS ARE THE PRODUCT'S, NOT THE READER'S. A report's
 * status (`open`, `in_review`, `resolved`, `dismissed`) and a restriction's
 * action (`warn`, `mute`, `ban`, …) are vocabulary the backend sends and the
 * moderator reads, so they are translated here rather than left in English. A
 * value the table does not know falls through unchanged.
 */
export interface ModerationStrings {
  /* ---- the moderator's dashboard ---- */
  dashboardTitle: string;
  dashboardDescription: string;
  dashboardLoadFailed: string;
  tabQueue: string;
  tabActions: string;
  tabStats: string;
  queueEmpty: string;
  actionsPlaceholder: string;
  statsPlaceholder: string;
  reportTargetId: (id: string) => string;
  reportTargetType: (type: string) => string;
  reportReason: (reason: string) => string;
  reportDescription: (description: string) => string;
  reportStatus: (status: string) => string;
  moderateInReview: string;
  moderateResolve: string;
  moderateDismiss: string;
  moderateFailed: string;
  statusLabels: Record<string, string>;
  targetTypeLabels: Record<string, string>;

  /* ---- filing a report ---- */
  reportPageTitle: string;
  reportPageDescription: string;
  reportTargetTypeLabel: string;
  reportTargetTypeStory: string;
  reportTargetTypeComment: string;
  reportTargetTypeUser: string;
  reportTargetIdLabel: string;
  reportTargetIdPlaceholder: string;
  reportReasonLabel: string;
  reportReasonPlaceholder: string;
  reportDescriptionLabel: string;
  reportDescriptionPlaceholder: string;
  reportSubmitButton: string;
  reportCancelButton: string;
  reportSubmitted: string;
  reportFailed: string;

  /* ---- the restrictions on the reader's own account ---- */
  restrictionsTitle: string;
  restrictionsDescription: string;
  restrictionsLoadFailed: string;
  restrictionsEmpty: string;
  restrictionAction: (action: string) => string;
  restrictionReason: (reason: string) => string;
  restrictionExpiresAt: (date: string) => string;
  restrictionCreatedAt: (date: string) => string;
  actionLabels: Record<string, string>;
}

export const AR: ModerationStrings = {
  dashboardTitle: "لوحة الاعتدال",
  dashboardDescription: "راقب البلاغات واتخذ الإجراءات المناسبة.",
  dashboardLoadFailed: "فشل تحميل لوحة الاعتدال",
  tabQueue: "طابور البلاغات",
  tabActions: "الإجراءات",
  tabStats: "الإحصائيات",
  queueEmpty: "لا توجد بلاغات معلّقة.",
  actionsPlaceholder: "الإجراءات تظهر هنا بعد اتخاذها.",
  statsPlaceholder: "الإحصائيات تظهر هنا عند توفرها.",
  reportTargetId: (id) => `معرّف الهدف: ${id}`,
  reportTargetType: (type) => `النوع: ${type}`,
  reportReason: (reason) => `السبب: ${reason}`,
  reportDescription: (description) => `الوصف: ${description}`,
  reportStatus: (status) => `الحالة: ${status}`,
  moderateInReview: "قيد المراجعة",
  moderateResolve: "حلّ",
  moderateDismiss: "رفض",
  moderateFailed: "تعذّر تحديث البلاغ",
  statusLabels: {
    open: "مفتوح",
    in_review: "قيد المراجعة",
    resolved: "تم الحل",
    dismissed: "مرفوض",
  },
  targetTypeLabels: {
    story: "قصة",
    comment: "تعليق",
    user: "مستخدم",
  },

  reportPageTitle: "إبلاغ عن محتوى",
  reportPageDescription: "ساعدنا في الحفاظ على بيئة آمنة من خلال الإبلاغ عن المحتوى المخالف.",
  reportTargetTypeLabel: "نوع الهدف",
  reportTargetTypeStory: "قصة",
  reportTargetTypeComment: "تعليق",
  reportTargetTypeUser: "مستخدم",
  reportTargetIdLabel: "معرّف الهدف",
  reportTargetIdPlaceholder: "معرّف القصة أو التعليق أو المستخدم",
  reportReasonLabel: "السبب",
  reportReasonPlaceholder: "مثال: محتوى مسيء",
  reportDescriptionLabel: "وصف إضافي",
  reportDescriptionPlaceholder: "أضف أي تفاصيل تساعد فريق الاعتدال على فهم الحالة.",
  reportSubmitButton: "إرسال التقرير",
  reportCancelButton: "إلغاء",
  reportSubmitted: "تم إرسال التقرير بنجاح",
  reportFailed: "فشل إرسال التقرير",

  restrictionsTitle: "القيود المفروضة",
  restrictionsDescription: "عرض القيود المرتبطة بحسابك.",
  restrictionsLoadFailed: "فشل تحميل القيود",
  restrictionsEmpty: "لا توجد قيود مفروضة على حسابك.",
  restrictionAction: (action) => `الإجراء: ${action}`,
  restrictionReason: (reason) => `السبب: ${reason}`,
  restrictionExpiresAt: (date) => `تنتهي في: ${date}`,
  restrictionCreatedAt: (date) => `تاريخ الإنشاء: ${date}`,
  actionLabels: {
    warn: "تحذير",
    mute: "كتم",
    ban: "حظر",
    content_removal: "إزالة المحتوى",
    no_action: "لا إجراء",
  },
};

export const EN: ModerationStrings = {
  dashboardTitle: "Moderation dashboard",
  dashboardDescription: "Watch the reports and take the right action on each one.",
  dashboardLoadFailed: "Couldn't load the moderation dashboard",
  tabQueue: "Report queue",
  tabActions: "Actions",
  tabStats: "Statistics",
  queueEmpty: "No pending reports.",
  actionsPlaceholder: "Actions show up here once they've been taken.",
  statsPlaceholder: "Statistics show up here when they're available.",
  reportTargetId: (id) => `Target id: ${id}`,
  reportTargetType: (type) => `Type: ${type}`,
  reportReason: (reason) => `Reason: ${reason}`,
  reportDescription: (description) => `Description: ${description}`,
  reportStatus: (status) => `Status: ${status}`,
  moderateInReview: "Under review",
  moderateResolve: "Resolve",
  moderateDismiss: "Dismiss",
  moderateFailed: "Couldn't update the report",
  statusLabels: {
    open: "Open",
    in_review: "Under review",
    resolved: "Resolved",
    dismissed: "Dismissed",
  },
  targetTypeLabels: {
    story: "Story",
    comment: "Comment",
    user: "User",
  },

  reportPageTitle: "Report content",
  reportPageDescription: "Help us keep the space safe by reporting content that breaks the rules.",
  reportTargetTypeLabel: "Target type",
  reportTargetTypeStory: "Story",
  reportTargetTypeComment: "Comment",
  reportTargetTypeUser: "User",
  reportTargetIdLabel: "Target id",
  reportTargetIdPlaceholder: "The id of the story, comment or user",
  reportReasonLabel: "Reason",
  reportReasonPlaceholder: "For example: abusive content",
  reportDescriptionLabel: "Extra description",
  reportDescriptionPlaceholder: "Add anything that helps the moderation team understand the case.",
  reportSubmitButton: "Send report",
  reportCancelButton: "Cancel",
  reportSubmitted: "Your report was sent",
  reportFailed: "Couldn't send the report",

  restrictionsTitle: "Restrictions",
  restrictionsDescription: "The restrictions applied to your account.",
  restrictionsLoadFailed: "Couldn't load the restrictions",
  restrictionsEmpty: "There are no restrictions on your account.",
  restrictionAction: (action) => `Action: ${action}`,
  restrictionReason: (reason) => `Reason: ${reason}`,
  restrictionExpiresAt: (date) => `Expires on: ${date}`,
  restrictionCreatedAt: (date) => `Applied on: ${date}`,
  actionLabels: {
    warn: "Warning",
    mute: "Mute",
    ban: "Ban",
    content_removal: "Content removal",
    no_action: "No action",
  },
};
