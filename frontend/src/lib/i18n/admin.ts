/**
 * Admin surfaces: the hub, the moderation dashboard, the financial desk,
 * the verification desk and the role-management page.
 *
 * OWNED BY THE ADMIN SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * ROLE WORDS ARE THE BACKEND'S VOCABULARY. `super_admin`, `content_moderator`,
 * `financial_officer`, `verification_officer` are values the server sends and
 * the admin reads, so they are translated here rather than left in English.
 * A value the table does not know falls through unchanged.
 *
 * Each surface is namespaced so a page asks only for the copy it owns:
 * `admin.hub`, `admin.moderation`, `admin.financial`, `admin.verification`,
 * `admin.roles`. The shared `admin.common` block holds the role labels and
 * the guard messages every admin page reads.
 */
export interface AdminStrings {
  /* ---- shared admin chrome ---- */
  common: {
    hubTitle: string;
    hubDescription: string;
    roleSuperAdmin: string;
    roleContentModerator: string;
    roleFinancialOfficer: string;
    roleVerificationOfficer: string;
    notAdmin: string;
    wrongRole: string;
    requiresMfa: string;
    loadFailed: string;
    refresh: string;
  };

  /* ---- admin hub: the landing screen every admin sees first ---- */
  hub: {
    pageTitle: string;
    pageDescription: string;
    yourRole: string;
    availableSurfaces: string;
    moderationCardTitle: string;
    moderationCardDescription: string;
    financialCardTitle: string;
    financialCardDescription: string;
    verificationCardTitle: string;
    verificationCardDescription: string;
    rolesCardTitle: string;
    rolesCardDescription: string;
    enterSurface: string;
    noSurfaces: string;
    statsReports: string;
    statsActions: string;
    statsRestrictions: string;
    statsPayments: string;
    statsVerifications: string;
    statsRoleAssignments: string;
  };

  /* ---- moderation desk: reports, actions, statistics ---- */
  moderation: {
    pageTitle: string;
    pageDescription: string;
    tabQueue: string;
    tabActions: string;
    tabStats: string;
    queueEmpty: string;
    reportTargetId: (id: string) => string;
    reportTargetType: (type: string) => string;
    reportReason: (reason: string) => string;
    reportDescription: (description: string) => string;
    reportStatus: (status: string) => string;
    reportCreatedAt: (date: string) => string;
    moderateInReview: string;
    moderateResolve: string;
    moderateDismiss: string;
    moderateFailed: string;
    actionsPlaceholder: string;
    statsPlaceholder: string;
    statsReports: string;
    statsOpen: string;
    statsResolved: string;
    statsDismissed: string;
    statsActions: string;
    statsRestrictions: string;
    statusLabels: Record<string, string>;
    targetTypeLabels: Record<string, string>;
    actionLabels: Record<string, string>;
  };

  /* ---- financial desk: payments, refunds, payouts ---- */
  financial: {
    pageTitle: string;
    pageDescription: string;
    tabPayments: string;
    tabRefunds: string;
    tabPayouts: string;
    paymentsEmpty: string;
    refundsEmpty: string;
    payoutsEmpty: string;
    paymentId: (id: string) => string;
    paymentAmount: (amount: string) => string;
    paymentCurrency: (currency: string) => string;
    paymentStatus: (status: string) => string;
    paymentCreatedAt: (date: string) => string;
    paymentMethod: (method: string) => string;
    userId: (id: string) => string;
    approvePayment: string;
    rejectPayment: string;
    refundPayment: string;
    payoutUser: string;
    payoutAmount: string;
    payoutStatus: string;
    payoutCreatedAt: string;
    statsTotalPayments: string;
    statsTotalRefunds: string;
    statsTotalPayouts: string;
    statsPending: string;
    statsCompleted: string;
    statsFailed: string;
    statusLabels: Record<string, string>;
  };

  /* ---- verification desk: identity checks, publisher onboarding ---- */
  verification: {
    pageTitle: string;
    pageDescription: string;
    tabPending: string;
    tabApproved: string;
    tabRejected: string;
    verificationsEmpty: string;
    verificationId: (id: string) => string;
    verificationType: (type: string) => string;
    verificationStatus: (status: string) => string;
    verificationSubmittedAt: (date: string) => string;
    userFullName: (name: string) => string;
    userEmail: (email: string) => string;
    approveVerification: string;
    rejectVerification: string;
    requestMoreInfo: string;
    statsPending: string;
    statsApproved: string;
    statsRejected: string;
    statsTotal: string;
    statusLabels: Record<string, string>;
    typeLabels: Record<string, string>;
  };

  /* ---- role management: assign, revoke, list, stats, break-glass ---- */
  roles: {
    pageTitle: string;
    pageDescription: string;
    tabAssignments: string;
    tabStats: string;
    tabBreakGlass: string;
    assignmentsEmpty: string;
    assignUserId: (id: string) => string;
    assignRole: (role: string) => string;
    assignReason: (reason: string) => string;
    assignExpiresAt: (date: string) => string;
    assignAssignedBy: (name: string) => string;
    assignAssignedAt: (date: string) => string;
    assignButton: string;
    revokeButton: string;
    revokeConfirm: string;
    revokeFailed: string;
    breakGlassTitle: string;
    breakGlassDescription: string;
    breakGlassRole: (role: string) => string;
    breakGlassDuration: (minutes: number) => string;
    breakGlassReason: (reason: string) => string;
    breakGlassButton: string;
    breakGlassMaxMinutes: string;
    statsTotalAssignments: string;
    statsActiveAssignments: string;
    statsExpiredAssignments: string;
    statsBreakGlassUses: string;
    roleLabels: Record<string, string>;
  };
}

export const AR: AdminStrings = {
  common: {
    hubTitle: "لوحة المسؤول",
    hubDescription: "إدارة المنصة من خلال سطح عمل مخصص لدورك.",
    roleSuperAdmin: "المشرف العام",
    roleContentModerator: "مراجع المحتوى",
    roleFinancialOfficer: "المسؤول المالي",
    roleVerificationOfficer: "مسؤول التحقق",
    notAdmin: "أنت لست مسؤولاً",
    wrongRole: "هذه الصفحة مخصصة لدور مسؤول آخر. لا يمكنك الدخول إليها.",
    requiresMfa: "هذه العملية تتطلب التحقق بخطوتين",
    loadFailed: "فشل تحميل البيانات",
    refresh: "تحديث",
  },

  hub: {
    pageTitle: "لوحة المسؤول",
    pageDescription: "اختر سطح العمل المسؤول الذي تخوله له دورك.",
    yourRole: "دورك",
    availableSurfaces: "السطوح المتاحة",
    moderationCardTitle: "مراجعة المحتوى",
    moderationCardDescription: "البلاغات، والإجراءات، والإحصائيات الخاصة بالإشراف على المحتوى.",
    financialCardTitle: "المالية",
    financialCardDescription: "المدفوعات، والاستردادات، والتحويلات، وإحصائيات المنصة المالية.",
    verificationCardTitle: "التحقق من الهوية",
    verificationCardDescription: "طلبات التحقق من الهوية واعتماد الناشرين والمراجعة.",
    rolesCardTitle: "إدارة الأدوار",
    rolesCardDescription: "تعيين الأدوار الإدارية وسحبها، وإحصائيات التعيينات، وكسر الزجاج للطوارئ.",
    enterSurface: "الدخول إلى السطح",
    noSurfaces: "لا توجد سطوح عمل متاحة لدورك.",
    statsReports: "إجمالي البلاغات",
    statsActions: "إجمالي الإجراءات",
    statsRestrictions: "القيود النشطة",
    statsPayments: "إجمالي المدفوعات",
    statsVerifications: "طلبات التحقق",
    statsRoleAssignments: "تعيينات الأدوار",
  },

  moderation: {
    pageTitle: "مراجعة المحتوى",
    pageDescription: "إدارة البلاغات واتخاذ الإجراءات بحق المحتوى والمستخدمين.",
    tabQueue: "طابور البلاغات",
    tabActions: "الإجراءات",
    tabStats: "الإحصائيات",
    queueEmpty: "لا توجد بلاغات معلّقة.",
    reportTargetId: (id) => `معرّف الهدف: ${id}`,
    reportTargetType: (type) => `النوع: ${type}`,
    reportReason: (reason) => `السبب: ${reason}`,
    reportDescription: (description) => `الوصف: ${description}`,
    reportStatus: (status) => `الحالة: ${status}`,
    reportCreatedAt: (date) => `تاريخ الإنشاء: ${date}`,
    moderateInReview: "قيد المراجعة",
    moderateResolve: "حلّ",
    moderateDismiss: "رفض",
    moderateFailed: "تعذّر تحديث البلاغ",
    actionsPlaceholder: "الإجراءات تظهر هنا بعد اتخاذها.",
    statsPlaceholder: "الإحصائيات تظهر هنا عند توفرها.",
    statsReports: "إجمالي البلاغات",
    statsOpen: "مفتوحة",
    statsResolved: "تم الحل",
    statsDismissed: "مرفوضة",
    statsActions: "إجمالي الإجراءات",
    statsRestrictions: "القيود النشطة",
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
    actionLabels: {
      warn: "تحذير",
      mute: "كتم",
      ban: "حظر",
      content_removal: "إزالة المحتوى",
      no_action: "لا إجراء",
    },
  },

  financial: {
    pageTitle: "المالية",
    pageDescription: "إدارة المدفوعات والاستردادات والتحويلات وإحصائيات المنصة المالية.",
    tabPayments: "المدفوعات",
    tabRefunds: "الاستردادات",
    tabPayouts: "التحويلات",
    paymentsEmpty: "لا توجد مدفوعات.",
    refundsEmpty: "لا توجد استردادات.",
    payoutsEmpty: "لا توجد تحويلات.",
    paymentId: (id) => `معرف الدفعة: ${id}`,
    paymentAmount: (amount) => `المبلغ: ${amount}`,
    paymentCurrency: (currency) => `العملة: ${currency}`,
    paymentStatus: (status) => `الحالة: ${status}`,
    paymentCreatedAt: (date) => `تاريخ الإنشاء: ${date}`,
    paymentMethod: (method) => `طريقة الدفع: ${method}`,
    userId: (id) => `معرف المستخدم: ${id}`,
    approvePayment: "اعتماد",
    rejectPayment: "رفض",
    refundPayment: "استرداد",
    payoutUser: "المستخدم",
    payoutAmount: "المبلغ",
    payoutStatus: "الحالة",
    payoutCreatedAt: "تاريخ الإنشاء",
    statsTotalPayments: "إجمالي المدفوعات",
    statsTotalRefunds: "إجمالي الاستردادات",
    statsTotalPayouts: "إجمالي التحويلات",
    statsPending: "قيد الانتظار",
    statsCompleted: "مكتملة",
    statsFailed: "فشلت",
    statusLabels: {
      pending: "قيد الانتظار",
      completed: "مكتملة",
      failed: "فشلت",
      refunded: "مستردة",
    },
  },

  verification: {
    pageTitle: "التحقق من الهوية",
    pageDescription: "مراجعة طلبات التحقق من الهوية واعتماد الناشرين.",
    tabPending: "قيد الانتظار",
    tabApproved: "مُعتمد",
    tabRejected: "مرفوض",
    verificationsEmpty: "لا توجد طلبات تحقق.",
    verificationId: (id) => `معرف الطلب: ${id}`,
    verificationType: (type) => `النوع: ${type}`,
    verificationStatus: (status) => `الحالة: ${status}`,
    verificationSubmittedAt: (date) => `تاريخ التقدم: ${date}`,
    userFullName: (name) => `الاسم الكامل: ${name}`,
    userEmail: (email) => `البريد الإلكتروني: ${email}`,
    approveVerification: "اعتماد",
    rejectVerification: "رفض",
    requestMoreInfo: "طلب معلومات إضافية",
    statsPending: "قيد الانتظار",
    statsApproved: "معتمد",
    statsRejected: "مرفوض",
    statsTotal: "إجمالي الطلبات",
    statusLabels: {
      pending: "قيد الانتظار",
      approved: "معتمد",
      rejected: "مرفوض",
    },
    typeLabels: {
      identity: "التحقق من الهوية",
      publisher: "اعتماد ناشر",
    },
  },

  roles: {
    pageTitle: "إدارة الأدوار",
    pageDescription: "تعيين الأدوار الإدارية وسحبها، وإحصائيات التعيينات، وكسر الزجاج للطوارئ.",
    tabAssignments: "التعيينات",
    tabStats: "الإحصائيات",
    tabBreakGlass: "كسر الزجاج",
    assignmentsEmpty: "لا توجد تعيينات للأدوار.",
    assignUserId: (id) => `معرف المستخدم: ${id}`,
    assignRole: (role) => `الدور: ${role}`,
    assignReason: (reason) => `السبب: ${reason}`,
    assignExpiresAt: (date) => `ينتهي في: ${date}`,
    assignAssignedBy: (name) => `أُضيف بواسطة: ${name}`,
    assignAssignedAt: (date) => `تاريخ الإضافة: ${date}`,
    assignButton: "تعيين دور",
    revokeButton: "سحب",
    revokeConfirm: "تأكيد السحب",
    revokeFailed: "تعذّر سحب الدور",
    breakGlassTitle: "كسر الزجاج",
    breakGlassDescription: "ترقية مؤقتة لدور أعلى في حالات الطوارئ، مع التحقق بخطوتين والتسجيل الكامل.",
    breakGlassRole: (role) => `الدور المطلوب: ${role}`,
    breakGlassDuration: (minutes) => `المدة: ${minutes} دقيقة`,
    breakGlassReason: (reason) => `السبب: ${reason}`,
    breakGlassButton: "تفعيل كسر الزجاج",
    breakGlassMaxMinutes: "الأقصى 60 دقيقة",
    statsTotalAssignments: "إجمالي التعيينات",
    statsActiveAssignments: "التعيينات النشطة",
    statsExpiredAssignments: "التعيينات المنتهية",
    statsBreakGlassUses: "استخدامات كسر الزجاج",
    roleLabels: {
      super_admin: "المشرف العام",
      content_moderator: "مراجع المحتوى",
      financial_officer: "المسؤول المالي",
      verification_officer: "مسؤول التحقق",
    },
  },
};

export const EN: AdminStrings = {
  common: {
    hubTitle: "Admin panel",
    hubDescription: "Manage the platform through a surface dedicated to your role.",
    roleSuperAdmin: "Super Admin",
    roleContentModerator: "Content Moderator",
    roleFinancialOfficer: "Financial Officer",
    roleVerificationOfficer: "Verification Officer",
    notAdmin: "You are not an admin",
    wrongRole: "This page belongs to another admin role. You cannot enter it.",
    requiresMfa: "This action requires multi-factor authentication",
    loadFailed: "Failed to load data",
    refresh: "Refresh",
  },

  hub: {
    pageTitle: "Admin panel",
    pageDescription: "Choose the admin surface your role is entitled to.",
    yourRole: "Your role",
    availableSurfaces: "Available surfaces",
    moderationCardTitle: "Content moderation",
    moderationCardDescription: "Reports, actions and statistics for content moderation.",
    financialCardTitle: "Financial",
    financialCardDescription: "Payments, refunds, payouts and platform financial statistics.",
    verificationCardTitle: "Identity verification",
    verificationCardDescription: "Identity verification requests and publisher onboarding review.",
    rolesCardTitle: "Role management",
    rolesCardDescription: "Assign and revoke admin roles, assignment statistics, and break-glass emergency access.",
    enterSurface: "Enter surface",
    noSurfaces: "No admin surfaces are available for your role.",
    statsReports: "Total reports",
    statsActions: "Total actions",
    statsRestrictions: "Active restrictions",
    statsPayments: "Total payments",
    statsVerifications: "Verification requests",
    statsRoleAssignments: "Role assignments",
  },

  moderation: {
    pageTitle: "Content moderation",
    pageDescription: "Manage reports and take action on content and users.",
    tabQueue: "Report queue",
    tabActions: "Actions",
    tabStats: "Statistics",
    queueEmpty: "No pending reports.",
    reportTargetId: (id) => `Target id: ${id}`,
    reportTargetType: (type) => `Type: ${type}`,
    reportReason: (reason) => `Reason: ${reason}`,
    reportDescription: (description) => `Description: ${description}`,
    reportStatus: (status) => `Status: ${status}`,
    reportCreatedAt: (date) => `Created at: ${date}`,
    moderateInReview: "Under review",
    moderateResolve: "Resolve",
    moderateDismiss: "Dismiss",
    moderateFailed: "Couldn't update the report",
    actionsPlaceholder: "Actions show up here once they've been taken.",
    statsPlaceholder: "Statistics show up here when they're available.",
    statsReports: "Total reports",
    statsOpen: "Open",
    statsResolved: "Resolved",
    statsDismissed: "Dismissed",
    statsActions: "Total actions",
    statsRestrictions: "Active restrictions",
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
    actionLabels: {
      warn: "Warning",
      mute: "Mute",
      ban: "Ban",
      content_removal: "Content removal",
      no_action: "No action",
    },
  },

  financial: {
    pageTitle: "Financial",
    pageDescription: "Manage payments, refunds, payouts and platform financial statistics.",
    tabPayments: "Payments",
    tabRefunds: "Refunds",
    tabPayouts: "Payouts",
    paymentsEmpty: "No payments.",
    refundsEmpty: "No refunds.",
    payoutsEmpty: "No payouts.",
    paymentId: (id) => `Payment id: ${id}`,
    paymentAmount: (amount) => `Amount: ${amount}`,
    paymentCurrency: (currency) => `Currency: ${currency}`,
    paymentStatus: (status) => `Status: ${status}`,
    paymentCreatedAt: (date) => `Created at: ${date}`,
    paymentMethod: (method) => `Payment method: ${method}`,
    userId: (id) => `User id: ${id}`,
    approvePayment: "Approve",
    rejectPayment: "Reject",
    refundPayment: "Refund",
    payoutUser: "User",
    payoutAmount: "Amount",
    payoutStatus: "Status",
    payoutCreatedAt: "Created at",
    statsTotalPayments: "Total payments",
    statsTotalRefunds: "Total refunds",
    statsTotalPayouts: "Total payouts",
    statsPending: "Pending",
    statsCompleted: "Completed",
    statsFailed: "Failed",
    statusLabels: {
      pending: "Pending",
      completed: "Completed",
      failed: "Failed",
      refunded: "Refunded",
    },
  },

  verification: {
    pageTitle: "Identity verification",
    pageDescription: "Review identity verification requests and publisher onboarding.",
    tabPending: "Pending",
    tabApproved: "Approved",
    tabRejected: "Rejected",
    verificationsEmpty: "No verification requests.",
    verificationId: (id) => `Request id: ${id}`,
    verificationType: (type) => `Type: ${type}`,
    verificationStatus: (status) => `Status: ${status}`,
    verificationSubmittedAt: (date) => `Submitted at: ${date}`,
    userFullName: (name) => `Full name: ${name}`,
    userEmail: (email) => `Email: ${email}`,
    approveVerification: "Approve",
    rejectVerification: "Reject",
    requestMoreInfo: "Request more info",
    statsPending: "Pending",
    statsApproved: "Approved",
    statsRejected: "Rejected",
    statsTotal: "Total requests",
    statusLabels: {
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
    },
    typeLabels: {
      identity: "Identity verification",
      publisher: "Publisher onboarding",
    },
  },

  roles: {
    pageTitle: "Role management",
    pageDescription: "Assign and revoke admin roles, assignment statistics, and break-glass emergency access.",
    tabAssignments: "Assignments",
    tabStats: "Statistics",
    tabBreakGlass: "Break glass",
    assignmentsEmpty: "No role assignments.",
    assignUserId: (id) => `User id: ${id}`,
    assignRole: (role) => `Role: ${role}`,
    assignReason: (reason) => `Reason: ${reason}`,
    assignExpiresAt: (date) => `Expires at: ${date}`,
    assignAssignedBy: (name) => `Assigned by: ${name}`,
    assignAssignedAt: (date) => `Assigned at: ${date}`,
    assignButton: "Assign role",
    revokeButton: "Revoke",
    revokeConfirm: "Confirm revoke",
    revokeFailed: "Failed to revoke role",
    breakGlassTitle: "Break glass",
    breakGlassDescription: "Temporary elevation to a higher role in emergencies, with MFA and full audit logging.",
    breakGlassRole: (role) => `Role requested: ${role}`,
    breakGlassDuration: (minutes) => `Duration: ${minutes} minutes`,
    breakGlassReason: (reason) => `Reason: ${reason}`,
    breakGlassButton: "Activate break glass",
    breakGlassMaxMinutes: "Maximum 60 minutes",
    statsTotalAssignments: "Total assignments",
    statsActiveAssignments: "Active assignments",
    statsExpiredAssignments: "Expired assignments",
    statsBreakGlassUses: "Break glass uses",
    roleLabels: {
      super_admin: "Super Admin",
      content_moderator: "Content Moderator",
      financial_officer: "Financial Officer",
      verification_officer: "Verification Officer",
    },
  },
};
