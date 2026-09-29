export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  avatar?: string;
  bio?: string;
  accountType: string;
  createdAt: string;
  stats?: {
    storiesCount: number;
    followersCount: number;
    followingCount: number;
  };
}

export interface Story {
  id: string;
  title: string;
  slug: string;
  content?: string;
  category: string;
  tags?: string[];
  status: string;
  views: number;
  reactions: number;
  author: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
  page: number;
  limit: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  coverImage?: string;
  isbn?: string;
  publisher?: string;
  publishDate?: string;
  language?: string;
  pageCount?: number;
  fileUrl?: string;
  fileType?: string;
  price?: number;
  isFree: boolean;
  status: string;
  categoryId?: string;
  views: number;
  likes: number;
  downloads: number;
  authorUser?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BooksListResponse {
  books: Book[];
  total: number;
  page: number;
  limit: number;
}

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paymobOrderId?: string;
  paymobPaymentId?: string;
  paymobTransactionId?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Rental {
  id: string;
  userId: string;
  bookId: string;
  status: string;
  startDate: string;
  endDate: string;
  extendedCount: number;
  maxExtensions: number;
  returnedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentalsListResponse {
  rentals: Rental[];
  total: number;
  page: number;
  limit: number;
}

export interface Contest {
  id: string;
  title: string;
  description: string;
  categoryId?: string;
  category?: string;
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  status: string;
  createdBy: string;
  winnerId?: string;
  prizeType?: string;
  prizeValue?: string;
  rules?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContestsListResponse {
  contests: Contest[];
  total: number;
  page: number;
  limit: number;
}

export interface ContestEntry {
  id: string;
  contestId: string;
  authorId: string;
  storyId: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export interface Conversation {
  id: string;
  participant: {
    id: string;
    name: string;
    avatar?: string;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface FollowsResponse {
  follows: Follow[];
  total: number;
  page: number;
  limit: number;
}

export type ReactionType = "like" | "love" | "laugh" | "cry" | "angry";

export interface Reaction {
  id: string;
  userId: string;
  user: { id: string; name: string };
  type: ReactionType;
  createdAt: string;
}

export interface ReactionsResponse {
  reactions: Reaction[];
  total: number;
  page: number;
  limit: number;
}

export interface Comment {
  id: string;
  userId: string;
  user: { id: string; name: string };
  content: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentsResponse {
  comments: Comment[];
  total: number;
  page: number;
  limit: number;
}

export interface SearchResult {
  id: string;
  type: "story" | "user" | "book";
  title: string;
  description?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface ModerationItem {
  id: string;
  type: "story" | "comment" | "user";
  reason: string;
  status: "pending" | "approved" | "rejected";
  reportedBy: { id: string; name: string };
  createdAt: string;
}

export interface ModerationResponse {
  items: ModerationItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: { field: string; message: string }[];
  statusCode: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LibraryItem {
  id: string;
  userId: string;
  bookId: string;
  rentalId?: string;
  status: string;
  addedAt: string;
  lastAccessedAt?: string;
  book: Book;
}

export interface LibraryResponse {
  items: LibraryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ReadingProgress {
  id: string;
  userId: string;
  bookId: string;
  currentPage: number;
  totalPages?: number;
  progressPercentage: number;
  startedAt: string;
  lastReadAt: string;
  completedAt?: string;
}
