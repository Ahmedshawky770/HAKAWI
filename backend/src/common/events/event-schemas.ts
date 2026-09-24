import { z } from 'zod';

export const UserRegisteredSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
});

export const UserUpdatedSchema = z.object({
  userId: z.string(),
  updatedFields: z.record(z.string(), z.unknown()),
});

export const UserDeletedSchema = z.object({
  userId: z.string(),
});

export const StoryCreatedSchema = z.object({
  storyId: z.string(),
  authorId: z.string(),
});

export const StoryUpdatedSchema = z.object({
  storyId: z.string(),
  updatedFields: z.record(z.string(), z.unknown()),
});

export const StoryPublishedSchema = z.object({
  storyId: z.string(),
  publishedAt: z.coerce.date(),
});

export const StoryArchivedSchema = z.object({
  storyId: z.string(),
});

export const StoryDeletedSchema = z.object({
  storyId: z.string(),
  authorId: z.string(),
});

export const FollowCreatedSchema = z.object({
  followerId: z.string(),
  followingId: z.string(),
});

export const FollowDeletedSchema = z.object({
  followerId: z.string(),
  followingId: z.string(),
});

export const ReactionCreatedSchema = z.object({
  userId: z.string(),
  storyId: z.string(),
  reactionType: z.string(),
});

export const ReactionDeletedSchema = z.object({
  userId: z.string(),
  storyId: z.string(),
});

export const CommentCreatedSchema = z.object({
  commentId: z.string(),
  storyId: z.string(),
  authorId: z.string(),
  parentId: z.string().optional(),
});

export const CommentUpdatedSchema = z.object({
  commentId: z.string(),
  storyId: z.string(),
});

export const CommentDeletedSchema = z.object({
  commentId: z.string(),
  storyId: z.string(),
});

export const CommentReactionCreatedSchema = z.object({
  userId: z.string(),
  commentId: z.string(),
  reactionType: z.string(),
});

export const CommentReactionDeletedSchema = z.object({
  userId: z.string(),
  commentId: z.string(),
});

export const NotificationCreatedSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
  type: z.string(),
});

export const NotificationReadSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
});

export const NotificationDeletedSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
});

export const MessageSentSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
});

export const MessageReadSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  readBy: z.string(),
});

export const EmailVerifiedSchema = z.object({
  userId: z.string(),
  email: z.string(),
});

export const EmailVerificationRequestedSchema = z.object({
  userId: z.string(),
  email: z.string(),
});

export const PasswordResetRequestedSchema = z.object({
  userId: z.string(),
  email: z.string(),
});

export const PasswordResetCompletedSchema = z.object({
  userId: z.string(),
});

export const ContestCreatedSchema = z.object({
  contestId: z.string(),
  createdBy: z.string(),
});

export const ContestUpdatedSchema = z.object({
  contestId: z.string(),
  updatedFields: z.record(z.string(), z.unknown()),
});

export const ContestStartedSchema = z.object({
  contestId: z.string(),
});

export const ContestCompletedSchema = z.object({
  contestId: z.string(),
  winnerId: z.string().nullable(),
});

export const ContestCancelledSchema = z.object({
  contestId: z.string(),
});

export const SubmissionSubmittedSchema = z.object({
  submissionId: z.string(),
  contestId: z.string(),
  authorId: z.string(),
});

export const SubmissionApprovedSchema = z.object({
  submissionId: z.string(),
  contestId: z.string(),
  authorId: z.string(),
});

export const SubmissionRejectedSchema = z.object({
  submissionId: z.string(),
  contestId: z.string(),
  authorId: z.string(),
});

export const VoteCastSchema = z.object({
  voteId: z.string(),
  contestId: z.string(),
  submissionId: z.string(),
  userId: z.string(),
});

export const WinnerSelectedSchema = z.object({
  contestId: z.string(),
  submissionId: z.string(),
  winnerId: z.string(),
});

export const PrizeDistributedSchema = z.object({
  prizeId: z.string(),
  contestId: z.string(),
  winnerId: z.string(),
});

export const BookCreatedSchema = z.object({
  bookId: z.string(),
  userId: z.string(),
});

export const BookUpdatedSchema = z.object({
  bookId: z.string(),
  updatedFields: z.record(z.string(), z.unknown()),
});

export const BookPublishedSchema = z.object({
  bookId: z.string(),
  publishedAt: z.coerce.date(),
});

export const BookArchivedSchema = z.object({
  bookId: z.string(),
});

export const BookDeletedSchema = z.object({
  bookId: z.string(),
  userId: z.string(),
});

export const PaymentInitiatedSchema = z.object({
  paymentId: z.string(),
  userId: z.string(),
});

export const PaymentCompletedSchema = z.object({
  paymentId: z.string(),
});

export const PaymentFailedSchema = z.object({
  paymentId: z.string(),
});

export const PaymentRefundedSchema = z.object({
  paymentId: z.string(),
  refundId: z.string(),
});

export const RefundCompletedSchema = z.object({
  refundId: z.string(),
});

export const RentalCreatedSchema = z.object({
  rentalId: z.string(),
  userId: z.string(),
  bookId: z.string(),
});

export const RentalExtendedSchema = z.object({
  rentalId: z.string(),
});

export const RentalReturnedSchema = z.object({
  rentalId: z.string(),
});

export const RentalExpiredSchema = z.object({
  rentalId: z.string(),
});

export const LibraryItemAddedSchema = z.object({
  libraryItemId: z.string(),
  userId: z.string(),
  bookId: z.string(),
});

export const LibraryItemAccessedSchema = z.object({
  libraryItemId: z.string(),
  userId: z.string(),
});

export const LibraryItemRemovedSchema = z.object({
  libraryItemId: z.string(),
  userId: z.string(),
});

export const ModerationReportCreatedSchema = z.object({
  reportId: z.string(),
  reporterId: z.string(),
  targetId: z.string(),
  targetType: z.string(),
  reason: z.string(),
});

export const ModerationActionTakenSchema = z.object({
  actionId: z.string(),
  reportId: z.string(),
  adminId: z.string(),
  targetUserId: z.string(),
  action: z.string(),
  reason: z.string(),
});

export const UserRestrictedSchema = z.object({
  userId: z.string(),
  type: z.string(),
  reason: z.string(),
  restrictedBy: z.string(),
  expiresAt: z.coerce.date().nullable(),
});

export const ModerationEscalatedSchema = z.object({
  targetId: z.string(),
  reportCount: z.number(),
});

export const EVENT_SCHEMAS: Record<string, { schema: z.ZodSchema; version: string }> = {
  'user.registered': { schema: UserRegisteredSchema, version: 'v1' },
  'user.updated': { schema: UserUpdatedSchema, version: 'v1' },
  'user.deleted': { schema: UserDeletedSchema, version: 'v1' },
  'story.created': { schema: StoryCreatedSchema, version: 'v1' },
  'story.updated': { schema: StoryUpdatedSchema, version: 'v1' },
  'story.published': { schema: StoryPublishedSchema, version: 'v1' },
  'story.archived': { schema: StoryArchivedSchema, version: 'v1' },
  'story.deleted': { schema: StoryDeletedSchema, version: 'v1' },
  'follow.created': { schema: FollowCreatedSchema, version: 'v1' },
  'follow.deleted': { schema: FollowDeletedSchema, version: 'v1' },
  'reaction.created': { schema: ReactionCreatedSchema, version: 'v1' },
  'reaction.deleted': { schema: ReactionDeletedSchema, version: 'v1' },
  'comment.created': { schema: CommentCreatedSchema, version: 'v1' },
  'comment.updated': { schema: CommentUpdatedSchema, version: 'v1' },
  'comment.deleted': { schema: CommentDeletedSchema, version: 'v1' },
  'comment_reaction.created': { schema: CommentReactionCreatedSchema, version: 'v1' },
  'comment_reaction.deleted': { schema: CommentReactionDeletedSchema, version: 'v1' },
  'notification.created': { schema: NotificationCreatedSchema, version: 'v1' },
  'notification.read': { schema: NotificationReadSchema, version: 'v1' },
  'notification.deleted': { schema: NotificationDeletedSchema, version: 'v1' },
  'message.sent': { schema: MessageSentSchema, version: 'v1' },
  'message.read': { schema: MessageReadSchema, version: 'v1' },
  'email.verified': { schema: EmailVerifiedSchema, version: 'v1' },
  'email.verification.requested': { schema: EmailVerificationRequestedSchema, version: 'v1' },
  'password.reset.requested': { schema: PasswordResetRequestedSchema, version: 'v1' },
  'password.reset.completed': { schema: PasswordResetCompletedSchema, version: 'v1' },
  'contest.created': { schema: ContestCreatedSchema, version: 'v1' },
  'contest.updated': { schema: ContestUpdatedSchema, version: 'v1' },
  'contest.started': { schema: ContestStartedSchema, version: 'v1' },
  'contest.completed': { schema: ContestCompletedSchema, version: 'v1' },
  'contest.cancelled': { schema: ContestCancelledSchema, version: 'v1' },
  'submission.submitted': { schema: SubmissionSubmittedSchema, version: 'v1' },
  'submission.approved': { schema: SubmissionApprovedSchema, version: 'v1' },
  'submission.rejected': { schema: SubmissionRejectedSchema, version: 'v1' },
  'vote.cast': { schema: VoteCastSchema, version: 'v1' },
  'winner.selected': { schema: WinnerSelectedSchema, version: 'v1' },
  'prize.distributed': { schema: PrizeDistributedSchema, version: 'v1' },
  'book.created': { schema: BookCreatedSchema, version: 'v1' },
  'book.updated': { schema: BookUpdatedSchema, version: 'v1' },
  'book.published': { schema: BookPublishedSchema, version: 'v1' },
  'book.archived': { schema: BookArchivedSchema, version: 'v1' },
  'book.deleted': { schema: BookDeletedSchema, version: 'v1' },
  'payment.initiated': { schema: PaymentInitiatedSchema, version: 'v1' },
  'payment.completed': { schema: PaymentCompletedSchema, version: 'v1' },
  'payment.failed': { schema: PaymentFailedSchema, version: 'v1' },
  'payment.refunded': { schema: PaymentRefundedSchema, version: 'v1' },
  'rental.created': { schema: RentalCreatedSchema, version: 'v1' },
  'rental.extended': { schema: RentalExtendedSchema, version: 'v1' },
  'rental.returned': { schema: RentalReturnedSchema, version: 'v1' },
  'rental.expired': { schema: RentalExpiredSchema, version: 'v1' },
  'library.item.added': { schema: LibraryItemAddedSchema, version: 'v1' },
  'library.item.accessed': { schema: LibraryItemAccessedSchema, version: 'v1' },
  'library.item.removed': { schema: LibraryItemRemovedSchema, version: 'v1' },
  'moderation.report.created': { schema: ModerationReportCreatedSchema, version: 'v1' },
  'moderation.action.taken': { schema: ModerationActionTakenSchema, version: 'v1' },
  'user.restricted': { schema: UserRestrictedSchema, version: 'v1' },
  'moderation.escalated': { schema: ModerationEscalatedSchema, version: 'v1' },
  'refund.created': { schema: PaymentRefundedSchema, version: 'v1' },
  'refund.completed': { schema: RefundCompletedSchema, version: 'v1' },
  'user.followed': { schema: FollowCreatedSchema, version: 'v1' },
  'user.unfollowed': { schema: FollowDeletedSchema, version: 'v1' },
  'story.reacted': { schema: ReactionCreatedSchema, version: 'v1' },
  'story.reaction.removed': { schema: ReactionDeletedSchema, version: 'v1' },
  'comment.reacted': { schema: CommentReactionCreatedSchema, version: 'v1' },
  'comment.reaction.removed': { schema: CommentReactionDeletedSchema, version: 'v1' },
  'payment.created': { schema: PaymentInitiatedSchema, version: 'v1' },
};
