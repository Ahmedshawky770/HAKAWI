/**
 * Response type definitions for integration tests.
 * These types replace `any` usage in supertest response bodies.
 */

export interface ApiErrorResponse {
  message: string | string[];
  error: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Comments module responses
export interface CommentResponse {
  id: string;
  authorId: string;
  storyId: string;
  content: string;
  parentId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentsListResponse {
  comments: CommentResponse[];
  total: number;
}

export interface CommentRepliesResponse {
  replies: CommentResponse[];
  total: number;
}

export interface CommentDeleteResponse {
  message: string;
}

// Follows module responses
export interface FollowResponse {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface FollowersListResponse {
  followers: FollowResponse[];
  total: number;
}

export interface FollowingListResponse {
  following: FollowResponse[];
  total: number;
}

export interface FollowStatusResponse {
  isFollowing: boolean;
}

export interface FollowStatsResponse {
  followersCount: number;
  followingCount: number;
}

// Messages module responses
export interface MessageUserResponse {
  id: string;
  username: string;
  name: string;
}

export interface ConversationResponse {
  id: string;
  participant1: MessageUserResponse;
  participant2: MessageUserResponse;
  lastMessage: MessageResponse | null;
  updatedAt: string;
  createdAt: string;
}

export interface ConversationsListResponse {
  conversations: ConversationResponse[];
  total: number;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  sender?: MessageUserResponse;
}

export interface MessagesListResponse {
  messages: MessageResponse[];
  total: number;
}

// Moderation module responses
export interface ReportResponse {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReportDetailResponse extends ReportResponse {
  reporter: { id: string; username: string };
  reportedUser: { id: string; username: string };
}

export interface ReportsListResponse {
  reports: ReportDetailResponse[];
  total: number;
}

export interface RestrictionResponse {
  id: string;
  userId: string;
  type: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface RestrictionsListResponse {
  restrictions: RestrictionResponse[];
  total: number;
}

export interface ModerationStatsResponse {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
}

// Notifications module responses
export interface NotificationActorResponse {
  id: string;
  username: string;
  name: string;
}

export interface NotificationPayload {
  storyId?: string;
  storyTitle?: string;
  commentId?: string;
  reactionType?: string;
  [key: string]: unknown;
}

export interface NotificationResponse {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
  actor?: NotificationActorResponse;
}

export interface NotificationsListResponse {
  notifications: NotificationResponse[];
  total: number;
  unreadCount: number;
}

export interface NotificationCountResponse {
  count: number;
}

export interface NotificationActionResponse {
  message: string;
}

// Reactions module responses
export interface ReactionResponse {
  id: string;
  userId: string;
  storyId: string;
  type: string;
  createdAt: string;
}

export interface ReactionDetailResponse extends ReactionResponse {
  user: { id: string; username: string; name: string };
}

export interface ReactionsListResponse {
  reactions: ReactionDetailResponse[];
  total: number;
}

export interface ReactionStatsResponse {
  like: number;
  love: number;
  haha: number;
  wow: number;
  sad: number;
  angry: number;
  total: number;
}

export interface UserReactionResponse {
  userId: string;
  type: string;
}

// Search module responses
export interface SearchResultAuthor {
  id: string;
  username: string;
  name: string;
}

export interface SearchResultStory {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  author: SearchResultAuthor;
  publishedAt: string | null;
  viewCount: number;
}

export interface SearchResultUser {
  id: string;
  username: string;
  name: string;
  bio: string | null;
}

export interface SearchResponse {
  results: SearchResultStory[];
  total: number;
  page: number;
  limit: number;
}

export interface SearchAuthorsResponse {
  authors: SearchResultUser[];
  total: number;
  page: number;
  limit: number;
}

// Stories module responses
export interface StoryAuthorResponse {
  id: string;
  username: string;
  name: string;
}

export interface StoryCategoryResponse {
  id: string;
  name: string;
  slug: string;
}

export interface StoryTagResponse {
  storyId: string;
  name: string;
}

export interface StoryListItemResponse {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  author: StoryAuthorResponse;
  category: StoryCategoryResponse | null;
  tags: StoryTagResponse[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  readingTime: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface StoryDetailResponse extends StoryListItemResponse {
  content: string;
}

export type StoryDetail = StoryDetailResponse;

export interface StoriesListResponse {
  stories: StoryListItemResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface MyStoriesListResponse {
  stories: StoryListItemResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface StoryCreateResponse {
  id: string;
  title: string;
  slug: string;
  status: string;
  authorId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoryPublishResponse {
  id: string;
  status: string;
  publishedAt: string;
}

export interface StoryArchiveResponse {
  id: string;
  status: string;
}

export interface StoryDeleteResponse {
  message: string;
}

// Users module responses
export interface UserProfileResponse {
  id: string;
  email: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  accountType: string;
  createdAt: string;
}

export interface PublicProfileResponse {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  accountType: string;
  stats: UserStatsResponse;
}

export interface UserStatsResponse {
  storiesCount: number;
  followersCount: number;
  followingCount: number;
}

export interface UserUpdateResponse {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  accountType: string;
}

export interface UserDeleteResponse {
  message: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserProfileResponse;
  tokens: AuthTokensResponse;
}

export interface VerificationRequestResponse {
  message: string;
  tokenExpiresAt: string;
}

export interface VerificationConfirmResponse {
  message: string;
}

export interface VerificationStatusResponse {
  isVerified: boolean;
  verifiedAt: string | null;
}

// Tags module responses
export interface TagResponse {
  id: string;
  name: string;
  slug: string;
  storiesCount: number;
  createdAt: string;
}

export interface TagsListResponse {
  tags: TagResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface TagCreateResponse {
  id: string;
  name: string;
  slug: string;
}

export interface TagUpdateResponse {
  id: string;
  name: string;
  slug: string;
}

// Upload module responses
export interface UploadResponse {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface UploadsListResponse {
  uploads: UploadResponse[];
  total: number;
  page: number;
  limit: number;
}

// Generic responses
export interface SuccessMessageResponse {
  message: string;
}

export interface IdResponse {
  id: string;
}