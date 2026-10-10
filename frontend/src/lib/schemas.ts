import { z } from "zod";

import {
  ACCOUNT_TYPES,
  ADMIN_ROLES,
  CONTEST_SUBMISSION_STATUSES,
  LIBRARY_ITEM_STATUSES,
  REACTION_TYPES,
  REPORT_SOURCES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from "@hakawi/shared-types";

import type {
  AuthResponse,
  Book,
  BookRecord,
  Comment,
  Contest,
  ContestSubmission,
  Conversation,
  Follow,
  LibraryItem,
  Message,
  Notification,
  Payment,
  PublicUserProfile,
  ReadingProgress,
  Rental,
  Report,
  SearchResponse,
  SessionResponse,
  Story,
  StoryRecord,
  StoryWriteResult,
  UploadTicket,
  UserStats,
} from "@hakawi/shared-types";

const nullableString = z.string().nullable();
const isoDate = z.string();

const authorSummarySchema = z.object({
  id: z.string(),
  name: nullableString,
});

const storyAuthorSchema = z.object({
  id: z.string(),
  name: nullableString.optional(),
});

const accountTypeSchema = z.enum(ACCOUNT_TYPES);
const reactionTypeSchema = z.enum(REACTION_TYPES);

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  username: z.string(),
  accountType: accountTypeSchema,
});

export const authResponseSchema: z.ZodType<AuthResponse> = z.object({
  user: authUserSchema,
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
});

export const sessionResponseSchema: z.ZodType<SessionResponse> = z.object({
  user: authUserSchema,
  expiresAt: isoDate,
});

export const publicUserProfileSchema: z.ZodType<PublicUserProfile> = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  avatar: nullableString,
  bio: nullableString,
  accountType: accountTypeSchema,
  isVerified: z.boolean(),
  createdAt: isoDate,
});

export const userStatsSchema: z.ZodType<UserStats> = z.object({
  storiesCount: z.number(),
  totalViews: z.number(),
  totalReactions: z.number(),
  followersCount: z.number(),
  followingCount: z.number(),
});

const storyWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: nullableString,
  content: nullableString,
  coverImage: nullableString,
  status: z.string(),
  category: nullableString,
  tags: z.array(z.string()),
  views: z.number(),
  reactions: z.number(),
  author: storyAuthorSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
});

const storyRecordShape = {
  id: z.string(),
  authorId: z.string(),
  authorName: nullableString,
  title: z.string(),
  slug: z.string(),
  excerpt: nullableString,
  content: nullableString,
  coverImage: nullableString,
  status: z.string(),
  categoryId: nullableString,
  viewCount: z.number(),
  likeCount: z.number(),
  commentCount: z.number(),
  readingTime: z.number().nullable(),
  publishedAt: nullableString,
  deletedAt: nullableString,
  createdAt: isoDate,
  updatedAt: isoDate,
};

const storyRecordSchema: z.ZodType<StoryRecord> = z.object(storyRecordShape);

type StoryWithOptionalAuthorName = Omit<Story, "author"> & {
  author: { id: string; name?: string | null };
};

const readAuthorName = (name: string | null | undefined): string | null => {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toWireStory = (record: StoryRecord): Story => ({
  id: record.id,
  title: record.title,
  slug: record.slug,
  excerpt: record.excerpt,
  content: record.content,
  coverImage: record.coverImage,
  status: record.status,
  category: record.categoryId,
  tags: [],
  views: record.viewCount,
  reactions: record.likeCount,
  author: { id: record.authorId, name: readAuthorName(record.authorName) },
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const withResolvedAuthorName = (story: StoryWithOptionalAuthorName): Story => ({
  ...story,
  author: { id: story.author.id, name: readAuthorName(story.author.name) },
});

export const storySchema: z.ZodType<Story, z.ZodTypeDef, unknown> = storyWireSchema.transform(withResolvedAuthorName);

export const storyResponseSchema: z.ZodType<Story, z.ZodTypeDef, unknown> = z
  .union([storyWireSchema, storyRecordSchema.transform(toWireStory)])
  .transform(withResolvedAuthorName);

export const storyRecordResponseSchema: z.ZodType<StoryRecord> = storyRecordSchema;

export const storyWriteResultSchema: z.ZodType<StoryWriteResult> = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  createdAt: isoDate,
});

export const storiesListResponseSchema = z.object({
  stories: z.array(storyResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

const bookWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  description: nullableString,
  coverImage: nullableString,
  isbn: nullableString,
  publisher: nullableString,
  publishDate: nullableString,
  language: nullableString,
  pageCount: z.number().nullable(),
  fileUrl: nullableString,
  fileType: nullableString,
  price: z.number().nullable(),
  isFree: z.boolean(),
  status: z.string(),
  categoryId: nullableString,
  views: z.number(),
  likes: z.number(),
  downloads: z.number(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const bookRecordSchema: z.ZodType<BookRecord> = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  description: nullableString,
  coverImage: nullableString,
  isbn: nullableString,
  publisher: nullableString,
  publishDate: nullableString,
  language: nullableString,
  pageCount: z.number().nullable(),
  fileUrl: nullableString,
  fileType: nullableString,
  price: z.number().nullable(),
  isFree: z.boolean(),
  status: z.string(),
  categoryId: nullableString,
  viewCount: z.number(),
  likeCount: z.number(),
  downloadCount: z.number(),
  deletedAt: nullableString,
  createdAt: isoDate,
  updatedAt: isoDate,
});

const toWireBook = (record: BookRecord): Book => ({
  id: record.id,
  title: record.title,
  author: record.author,
  description: record.description,
  coverImage: record.coverImage,
  isbn: record.isbn,
  publisher: record.publisher,
  publishDate: record.publishDate,
  language: record.language,
  pageCount: record.pageCount,
  fileUrl: record.fileUrl,
  fileType: record.fileType,
  price: record.price,
  isFree: record.isFree,
  status: record.status,
  categoryId: record.categoryId,
  views: record.viewCount,
  likes: record.likeCount,
  downloads: record.downloadCount,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const bookSchema: z.ZodType<Book> = bookWireSchema;

export const bookResponseSchema: z.ZodType<Book, z.ZodTypeDef, unknown> = z.union([
  bookWireSchema,
  bookRecordSchema.transform(toWireBook),
]);

export const bookRecordResponseSchema: z.ZodType<BookRecord> = bookRecordSchema;

export const booksListResponseSchema = z.object({
  books: z.array(bookResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

/**
 * What a money path returns.
 *
 * This schema asked for `{ paymentId, orderId, paymobUrl }` while the API returned the whole
 * `payments` row — which has no URL field at all. Zod rejected every response, so `purchaseBook`
 * errored on every attempt and the customer was never sent to Paymob. The API now returns this exact
 * shape from both `POST /books/:id/purchase` and `POST /books/:id/rent`, declared once in
 * `@hakawi/shared-types` as `BookCheckoutResponse` (Principle #9).
 */
export const purchaseResultSchema = z.object({
  paymentId: z.string(),
  orderId: z.string(),
  /** Where to send the customer. Load this in the iframe integration. */
  checkoutUrl: z.string(),
  /** Paymob's hosted accept URL, for a redirect flow instead of the iframe. */
  acceptUrl: z.string(),
  /** 'pending' until the webhook confirms. */
  status: z.string(),
});

/** Alias kept so the two money paths read the same at the call site. */
export const bookCheckoutSchema = purchaseResultSchema;

export const readingProgressSchema: z.ZodType<ReadingProgress> = z.object({
  id: z.string(),
  bookId: z.string(),
  currentPage: z.number(),
  totalPages: z.number().nullable(),
  progressPercentage: z.number(),
  lastReadAt: isoDate,
  completedAt: nullableString,
});

export const readingProgressListResponseSchema = z.object({
  progress: z.array(readingProgressSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const libraryItemSchema: z.ZodType<LibraryItem> = z.object({
  id: z.string(),
  userId: z.string(),
  bookId: z.string(),
  rentalId: nullableString,
  status: z.enum(LIBRARY_ITEM_STATUSES),
  addedAt: isoDate,
  lastAccessedAt: nullableString,
});

export const libraryListResponseSchema = z.object({
  items: z.array(libraryItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const paymentSchema: z.ZodType<Payment> = z.object({
  id: z.string(),
  userId: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  paymentMethod: z.string(),
  paymobOrderId: nullableString,
  paymobPaymentId: nullableString,
  paymobTransactionId: nullableString,
  description: nullableString,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const paymentsListResponseSchema = z.object({
  payments: z.array(paymentSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

/**
 * What an extension costs, before the customer commits to paying it.
 *
 * The quote exists because `POST /rentals/:id/extend` now initialises a payment: calling it first
 * would send someone to a checkout for an extension they may not be permitted — not their rental, not
 * active, cap already reached, duration not offered. The quote runs every one of those checks and
 * returns the amount, so nothing is charged until the price has been seen.
 */
export const rentalQuoteSchema = z.object({
  rentalId: z.string(),
  bookId: z.string(),
  extensionDays: z.number(),
  amount: z.number(),
  currency: z.string(),
});

export const rentalSchema: z.ZodType<Rental> = z.object({
  id: z.string(),
  userId: z.string(),
  bookId: z.string(),
  status: z.string(),
  startDate: isoDate,
  endDate: isoDate,
  extendedCount: z.number(),
  maxExtensions: z.number(),
  returnedAt: nullableString,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const rentalsListResponseSchema = z.object({
  rentals: z.array(rentalSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const reactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  storyId: z.string(),
  type: reactionTypeSchema,
  createdAt: isoDate,
});

export const pageEnvelope = {
  total: z.number(),
  page: z.number(),
  limit: z.number(),
};

export const reactionsListResponseSchema = z.object({
  reactions: z.array(reactionSchema),
  ...pageEnvelope,
});

export const reactionCountsSchema = z.object({
  like: z.number().optional(),
  love: z.number().optional(),
  wow: z.number().optional(),
  sad: z.number().optional(),
  angry: z.number().optional(),
  haunted: z.number().optional(),
});

export const commentSchema: z.ZodType<Comment> = z.object({
  id: z.string(),
  storyId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  parentId: nullableString,
  content: z.string(),
  likeCount: z.number(),
  replyCount: z.number(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const commentsListResponseSchema = z.object({
  comments: z.array(commentSchema),
  ...pageEnvelope,
});

export const followSchema: z.ZodType<Follow> = z.object({
  id: z.string(),
  followerId: z.string(),
  followingId: z.string(),
  createdAt: isoDate,
});

export const followersResponseSchema = z.object({
  followers: z.array(followSchema),
  ...pageEnvelope,
});

export const followingResponseSchema = z.object({
  following: z.array(followSchema),
  ...pageEnvelope,
});

export const conversationSchema: z.ZodType<Conversation> = z.object({
  id: z.string(),
  participant1Id: z.string(),
  participant2Id: z.string(),
  participant: authorSummarySchema,
  lastMessage: z
    .object({
      content: z.string(),
      createdAt: isoDate,
    })
    .optional(),
  unreadCount: z.number(),
  createdAt: isoDate,
});

export const conversationsListResponseSchema = z.object({
  conversations: z.array(conversationSchema),
  ...pageEnvelope,
});

export const messageSchema: z.ZodType<Message> = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  isRead: z.boolean(),
  readAt: nullableString,
  createdAt: isoDate,
});

export const messagesListResponseSchema = z.object({
  messages: z.array(messageSchema),
  ...pageEnvelope,
});

export const notificationSchema: z.ZodType<Notification, z.ZodTypeDef, unknown> = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).nullable(),
  isRead: z.boolean(),
  readAt: nullableString,
  createdAt: isoDate,
});

export const notificationsListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  ...pageEnvelope,
});

export const contestSchema: z.ZodType<Contest> = z.object({
  id: z.string(),
  title: z.string(),
  description: nullableString,
  categoryId: nullableString,
  startDate: isoDate,
  endDate: isoDate,
  submissionDeadline: isoDate,
  status: z.string(),
  createdBy: z.string(),
  winnerId: nullableString,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const contestsListResponseSchema = z.object({
  contests: z.array(contestSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const contestSubmissionSchema: z.ZodType<ContestSubmission> = z.object({
  id: z.string(),
  contestId: z.string(),
  storyId: z.string(),
  authorId: z.string(),
  status: z.enum(CONTEST_SUBMISSION_STATUSES),
  submittedAt: isoDate,
  reviewedAt: nullableString,
  reviewedBy: nullableString,
});

export const reportSchema: z.ZodType<Report, z.ZodTypeDef, unknown> = z.object({
  id: z.string(),
  reporterId: nullableString,
  targetId: z.string(),
  targetType: z.enum(REPORT_TARGET_TYPES),
  reason: z.string(),
  description: nullableString,
  status: z.enum(REPORT_STATUSES),
  source: z.enum(REPORT_SOURCES),
  escalatedAt: nullableString,
  resolvedAt: nullableString,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const reportsListResponseSchema = z.object({
  reports: z.array(reportSchema),
  ...pageEnvelope,
});

export const badgeCatalogSchema = z.object({
  badges: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      description: z.string(),
      icon: z.string(),
      trigger: z.string(),
      threshold: z.number(),
    }),
  ),
});

export const awardedBadgeSchema = z.object({
  id: z.string(),
  badgeId: z.string(),
  badgeKey: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  awardedAt: isoDate,
});

export const userBadgesResponseSchema = z.object({
  badges: z.array(awardedBadgeSchema),
});

export const publisherStatsSchema = z.object({
  totalContests: z.number(),
  activeContests: z.number(),
  completedContests: z.number(),
  totalSubmissions: z.number(),
  pendingSubmissions: z.number(),
  approvedSubmissions: z.number(),
  rejectedSubmissions: z.number(),
  totalVotes: z.number(),
  totalPrizes: z.number(),
});

export const publisherSubmissionSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  authorId: z.string(),
  status: z.string(),
  submittedAt: isoDate,
  reviewedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  votes: z.number(),
  storyTitle: z.string().optional(),
  authorName: z.string().optional(),
});

export const publisherSubmissionsResponseSchema = z.object({
  submissions: z.array(publisherSubmissionSchema),
  ...pageEnvelope,
});

export const publisherVoteSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  userId: z.string(),
  createdAt: isoDate,
  submissionTitle: z.string().optional(),
  userName: z.string().optional(),
});

export const publisherVotesResponseSchema = z.object({
  votes: z.array(publisherVoteSchema),
  ...pageEnvelope,
});

export const downloadResponseSchema = z.object({
  downloadUrl: z.string(),
});

export const createBookResponseSchema = bookRecordSchema;

export const contestVoteSchema: z.ZodType<import("@hakawi/shared-types").ContestVote> = z.object({
  id: z.string(),
  contestId: z.string(),
  submissionId: z.string(),
  userId: z.string(),
  createdAt: isoDate,
});

export const contestVotesResponseSchema = z.object({
  votes: z.array(contestVoteSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const contestPrizesResponseSchema = z.object({
  prizes: z.array(
    z.object({
      id: z.string(),
      contestId: z.string(),
      submissionId: z.string(),
      winnerId: z.string(),
      prizeType: z.string(),
      prizeDescription: z.string().nullable(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      distributedAt: z.string().nullable(),
      createdAt: isoDate,
    }),
  ),
});

export const restrictionsResponseSchema = z.object({
  restrictions: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      action: z.string(),
      reason: z.string(),
      durationMinutes: z.number().nullable(),
      expiresAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});

export const searchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: nullableString,
  status: z.string(),
  category: nullableString,
  tags: z.array(z.string()),
  author: authorSummarySchema,
  views: z.number(),
  reactions: z.number(),
  createdAt: isoDate,
  highlightedTitle: z.string().optional(),
  highlightedExcerpt: z.string().optional(),
});

export const searchResponseSchema: z.ZodType<SearchResponse> = z.object({
  results: z.array(searchResultSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  query: z.string(),
  took: z.number(),
});

export const uploadTicketSchema: z.ZodType<UploadTicket> = z.object({
  filename: z.string(),
  originalName: z.string(),
  mimetype: z.string(),
  size: z.number(),
  url: z.string(),
  cdnUrl: z.string().optional(),
  uploadedAt: z.string().optional(),
});

export const countResultSchema = z.object({
  count: z.number(),
});

export const messageOnlySchema = z.object({
  message: z.string(),
});

export const emptyResponseSchema = z.undefined();

export const adminRoleSchema = z.enum(ADMIN_ROLES);

export const storyStatusSchema = z.enum(["draft", "published", "archived"]);

export type AuthResponseShape = z.infer<typeof authResponseSchema>;
export type SessionResponseShape = z.infer<typeof sessionResponseSchema>;
export type StoriesListResponseShape = z.infer<typeof storiesListResponseSchema>;
export type BooksListResponseShape = z.infer<typeof booksListResponseSchema>;
export type LibraryListResponseShape = z.infer<typeof libraryListResponseSchema>;
export type ReadingProgressListResponseShape = z.infer<typeof readingProgressListResponseSchema>;
export type PaymentsListResponseShape = z.infer<typeof paymentsListResponseSchema>;
export type RentalsListResponseShape = z.infer<typeof rentalsListResponseSchema>;
export type ReactionsListResponseShape = z.infer<typeof reactionsListResponseSchema>;
export type CommentsListResponseShape = z.infer<typeof commentsListResponseSchema>;
export type FollowersResponseShape = z.infer<typeof followersResponseSchema>;
export type FollowingResponseShape = z.infer<typeof followingResponseSchema>;
export type ConversationsListResponseShape = z.infer<typeof conversationsListResponseSchema>;
export type MessagesListResponseShape = z.infer<typeof messagesListResponseSchema>;
export type NotificationsListResponseShape = z.infer<typeof notificationsListResponseSchema>;
export type ContestsListResponseShape = z.infer<typeof contestsListResponseSchema>;
export type ReportsListResponseShape = z.infer<typeof reportsListResponseSchema>;
