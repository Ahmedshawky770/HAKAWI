import { countReadout, type CountReadout } from "./common";

/**
 * The surfaces where people meet: messages, notifications, profiles, follows
 * and search results.
 *
 * OWNED BY THE SOCIAL SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * WHAT BELONGS HERE AND WHAT DOES NOT. A message BODY and a notification's
 * title are things a person wrote, so they are shown exactly as they arrived;
 * everything the PRODUCT says about them — the empty state, the unread label,
 * the button that marks a notification read — is said here. The same rule
 * applies to the follow lists and the search result rows that live in the same
 * namespace.
 */
export interface SocialStrings {
  /* ---- the conversation list ---- */
  messagesTitle: string;
  messagesUnreadDescription: (count: number) => string;
  messagesLoadFailed: string;
  conversationsEmptyTitle: string;
  conversationsEmptyDescription: string;
  conversationParticipantFallback: string;
  conversationNoMessages: string;
  conversationUnreadLabel: string;

  /* ---- one conversation ---- */
  conversationTitle: string;
  conversationBack: string;
  conversationLoadFailed: string;
  conversationEmptyTitle: string;
  conversationEmptyDescription: string;
  conversationLogLabel: string;
  messageInputLabel: string;
  messageInputPlaceholder: string;
  messageSendButton: string;
  messageSentAnnouncement: string;
  messageSendFailed: string;
  /** The reader's own side of a thread. */
  messageOwnLabel: string;

  /* ---- notifications ---- */
  notificationsTitle: string;
  notificationsLoadFailed: string;
  notificationsUnreadCountFailed: string;
  notificationsUnreadLabel: string;
  notificationsEmptyTitle: string;
  notificationsEmptyDescription: string;
  notificationNewBadge: string;
  notificationMarkAsRead: string;
  notificationMarkAsReadFailed: string;

  /* ---- the follow lists ---- */
  followAvatarFallback: string;
  followFollowerLabel: string;
  followFollowingLabel: string;
  followEmptyFollowers: string;
  followEmptyFollowing: string;
  /** The page title over a list of followers. */
  followersTitle: string;
  /**
   * The tab title of the followers page.
   *
   * The id is in it because the server cannot read the account's name without
   * a request of its own, and a tab that names the route and nothing else is
   * a worse answer than one that names the route and who it is about.
   */
  followersPageTitle: (id: string) => string;
  /** The page title over a list of the accounts somebody follows. */
  followingPageTitle: (id: string) => string;
  followersDescription: string;
  followersLoadFailed: string;
  /** The page title over a list of the accounts somebody follows. */
  followingTitle: string;
  followingDescription: string;
  followingLoadFailed: string;

  /* ---- the row components ---- */
  /**
   * The name a row shows when the API sends no name at all.
   *
   * `followAvatarFallback` says the same word for the follow rows; the two keys
   * exist because the follow surface named its own copy first, and renaming it
   * would break a key another surface already reads.
   */
  authorFallback: string;
  /** The replies a comment carries, split into digits and noun. */
  commentReplies: (count: number) => CountReadout;
  commentListEmpty: string;
  reactionListEmpty: string;

  /* ---- the comment form ---- */
  commentInputLabel: string;
  commentInputPlaceholder: string;
  commentSendButton: string;
  commentSendFailed: string;
  commentSentAnnouncement: string;
  /** The word shown for the reader's own comment instead of their name. */
  commentOwnLabel: string;
  /** The character-limit hint under the composer. */
  commentLimitReached: string;
  commentRemaining: (count: number) => string;

  /* ---- comment actions ---- */
  commentReplyButton: string;
  commentReplyPlaceholder: string;
  commentEditButton: string;
  commentDeleteButton: string;
  commentDeleteConfirmButton: string;
  commentDeleteUndoButton: string;
  commentDeletedAnnouncement: string;
  commentUpdateFailed: string;
  commentDeleteFailed: string;
  commentLoadingReplies: string;

  /* ---- comment reactions ---- */
  commentReactionLabel: string;
  commentReactionFailed: string;
  /** The word a comment count is read with on a story surface. */
  commentCountLabel: string;
  /** A comment count readout, split into digits and noun. */
  commentCount: (count: number) => CountReadout;
  /** Shown in the composer when the reader is not signed in. */
  commentSignInRequired: string;

  /* ---- a reader's public profile ---- */
  profileLoadFailed: string;
  profileIdMissing: string;
  profileUserNotFound: string;
  profileBioFallback: string;

  /* ---- the search result rows ---- */
  searchPublished: string;
  searchUnpublished: string;
  searchUnknownAuthor: string;
  searchViewsLabel: string;
  searchReactionsLabel: string;
}

export const AR: SocialStrings = {
  messagesTitle: "الرسائل",
  messagesUnreadDescription: (count) => `لديك ${count} رسالة غير مقروءة.`,
  messagesLoadFailed: "تعذّر تحميل المحادثات",
  conversationsEmptyTitle: "لا توجد محادثات بعد",
  conversationsEmptyDescription: "ابدأ محادثة من صفحة كاتب أي قصة، وستظهر هنا.",
  conversationParticipantFallback: "مستخدم",
  conversationNoMessages: "لا توجد رسائل بعد",
  conversationUnreadLabel: "رسائل غير مقروءة",

  conversationTitle: "المحادثة",
  conversationBack: "العودة إلى الرسائل",
  conversationLoadFailed: "تعذّر تحميل الرسائل",
  conversationEmptyTitle: "لا توجد رسائل بعد",
  conversationEmptyDescription: "اكتب أول رسالة في هذه المحادثة.",
  conversationLogLabel: "رسائل المحادثة",
  messageInputLabel: "اكتب رسالتك",
  messageInputPlaceholder: "اكتب رسالة…",
  messageSendButton: "إرسال",
  messageSentAnnouncement: "تم إرسال رسالتك",
  messageSendFailed: "تعذّر إرسال الرسالة",
  messageOwnLabel: "أنت",

  notificationsTitle: "الإشعارات",
  notificationsLoadFailed: "تعذّر تحميل الإشعارات",
  notificationsUnreadCountFailed: "تعذّر جلب العدد",
  notificationsUnreadLabel: "إشعار غير مقروء",
  notificationsEmptyTitle: "لا توجد إشعارات بعد.",
  notificationsEmptyDescription: "سيصلك هنا كل تفاعل وتعليق ومتابعة على قصصك.",
  notificationNewBadge: "جديد",
  notificationMarkAsRead: "تعليم كمقروء",
  notificationMarkAsReadFailed: "تعذّر تعليم الإشعار كمقروء",

  followAvatarFallback: "مستخدم",
  followFollowerLabel: "متابع",
  followFollowingLabel: "متابَع",
  followEmptyFollowers: "لا يوجد متابعون بعد.",
  followEmptyFollowing: "لا يوجد متابَعون بعد.",
  followersTitle: "المتابعون",
  followersPageTitle: (id) => `المتابعون - ${id}`,
  followingPageTitle: (id) => `المتابَعون - ${id}`,
  followersDescription: "من يتابع هذا الحساب",
  followersLoadFailed: "تعذّر تحميل المتابعين",
  followingTitle: "المتابَعون",
  followingDescription: "الحسابات التي يتابعها",
  followingLoadFailed: "تعذّر تحميل المتابَعين",

  authorFallback: "مستخدم",
  commentReplies: (count) =>
    countReadout(count, "ar", { zero: "رد", one: "رد", two: "ردان", few: "ردود", many: "رداً", other: "رد" }),
  commentListEmpty: "لا توجد تعليقات بعد. كن أول من يعلق!",
  reactionListEmpty: "لا توجد تفاعلات بعد. كن أول من يتفاعل!",

  commentInputLabel: "أضف تعليقاً",
  commentInputPlaceholder: "اكتب تعليقك هنا…",
  commentSendButton: "إرسال",
  commentSendFailed: "تعذّر إرسال التعليق",
  commentSentAnnouncement: "تم إرسال تعليقك",
  commentOwnLabel: "أنت",
  commentLimitReached: "وصلت الحد الأقصى لطول التعليق",
  commentRemaining: (count) => `${count} حرفاً متبقياً`,

  commentReplyButton: "الرد",
  commentReplyPlaceholder: "اكتب ردك…",
  commentEditButton: "تعديل",
  commentDeleteButton: "حذف",
  commentDeleteConfirmButton: "تأكيد الحذف",
  commentDeleteUndoButton: "تراجع",
  commentDeletedAnnouncement: "تم حذف التعليق",
  commentUpdateFailed: "فشل تحديث التعليق",
  commentDeleteFailed: "فشل حذف التعليق",
  commentLoadingReplies: "جاري تحميل الردود…",

  commentReactionLabel: "تفاعل",
  commentReactionFailed: "تعذّر تسجيل التفاعل.",
  commentCountLabel: "تعليق",
  commentCount: (count) =>
    countReadout(count, "ar", { zero: "تعليقات", one: "تعليق", two: "تعليقان", few: "تعليقات", many: "تعليقاً", other: "تعليق" }),
  commentSignInRequired: "سجّل الدخول لتتمكن من التعليق",

  profileLoadFailed: "تعذّر تحميل الملف الشخصي",
  profileIdMissing: "معرف المستخدم مفقود",
  profileUserNotFound: "المستخدم غير موجود",
  profileBioFallback: "لا توجد نبذة شخصية بعد",

  searchPublished: "منشورة",
  searchUnpublished: "غير منشورة",
  searchUnknownAuthor: "مؤلف مجهول",
  searchViewsLabel: "مشاهدة",
  searchReactionsLabel: "تفاعل",
};

export const EN: SocialStrings = {
  messagesTitle: "Messages",
  messagesUnreadDescription: (count) => {
    const readout = countReadout(count, "en", { one: "unread message", other: "unread messages" });
    return `You have ${readout.count} ${readout.label}.`;
  },
  messagesLoadFailed: "Couldn't load the conversations",
  conversationsEmptyTitle: "No conversations yet",
  conversationsEmptyDescription: "Start a conversation from any writer's page and it will show up here.",
  conversationParticipantFallback: "Reader",
  conversationNoMessages: "No messages yet",
  conversationUnreadLabel: "unread messages",

  conversationTitle: "Conversation",
  conversationBack: "Back to messages",
  conversationLoadFailed: "Couldn't load the messages",
  conversationEmptyTitle: "No messages yet",
  conversationEmptyDescription: "Write the first message in this conversation.",
  conversationLogLabel: "Conversation messages",
  messageInputLabel: "Write your message",
  messageInputPlaceholder: "Write a message…",
  messageSendButton: "Send",
  messageSentAnnouncement: "Your message was sent",
  messageSendFailed: "Couldn't send the message",
  messageOwnLabel: "You",

  notificationsTitle: "Notifications",
  notificationsLoadFailed: "Couldn't load the notifications",
  notificationsUnreadCountFailed: "Couldn't fetch the count",
  notificationsUnreadLabel: "unread notifications",
  notificationsEmptyTitle: "No notifications yet.",
  notificationsEmptyDescription: "Every reaction, comment and follow on your stories will land here.",
  notificationNewBadge: "New",
  notificationMarkAsRead: "Mark as read",
  notificationMarkAsReadFailed: "Couldn't mark the notification as read",

  followAvatarFallback: "Reader",
  followFollowerLabel: "Follower",
  followFollowingLabel: "Following",
  followEmptyFollowers: "No followers yet.",
  followEmptyFollowing: "Not following anyone yet.",
  followersTitle: "Followers",
  followersPageTitle: (id) => `Followers - ${id}`,
  followingPageTitle: (id) => `Following - ${id}`,
  followersDescription: "Who follows this account",
  followersLoadFailed: "Couldn't load the followers",
  followingTitle: "Following",
  followingDescription: "The accounts this one follows",
  followingLoadFailed: "Couldn't load the following",

  authorFallback: "Reader",
  commentReplies: (count) => countReadout(count, "en", { one: "reply", other: "replies" }),
  commentListEmpty: "No comments yet. Be the first to comment!",
  reactionListEmpty: "No reactions yet. Be the first to react!",

  commentInputLabel: "Add a comment",
  commentInputPlaceholder: "Write your comment here…",
  commentSendButton: "Send",
  commentSendFailed: "Couldn't send the comment",
  commentSentAnnouncement: "Your comment was sent",
  commentOwnLabel: "You",
  commentLimitReached: "You've reached the comment length limit",
  commentRemaining: (count) => `${count} characters left`,

  commentReplyButton: "Reply",
  commentReplyPlaceholder: "Write your reply…",
  commentEditButton: "Edit",
  commentDeleteButton: "Delete",
  commentDeleteConfirmButton: "Confirm deletion",
  commentDeleteUndoButton: "Undo",
  commentDeletedAnnouncement: "The comment was deleted",
  commentUpdateFailed: "Couldn't update the comment",
  commentDeleteFailed: "Couldn't delete the comment",
  commentLoadingReplies: "Loading replies…",

  commentReactionLabel: "React",
  commentReactionFailed: "Couldn't record the reaction.",
  commentCountLabel: "comment",
  commentCount: (count) => countReadout(count, "en", { one: "comment", other: "comments" }),
  commentSignInRequired: "Sign in to comment",

  profileLoadFailed: "Couldn't load the profile",
  profileIdMissing: "The user's id is missing",
  profileUserNotFound: "This user doesn't exist",
  profileBioFallback: "No bio yet",

  searchPublished: "Published",
  searchUnpublished: "Not published",
  searchUnknownAuthor: "Unknown author",
  searchViewsLabel: "views",
  searchReactionsLabel: "reactions",
};
