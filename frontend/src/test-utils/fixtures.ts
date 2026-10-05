import type {
  AuthResponse,
  Book,
  BookRecord,
  Notification,
  Payment,
  SessionResponse,
  Story,
  StoryRecord,
} from "@hakawi/shared-types";

export const AUTH_USER = {
  id: "user-1",
  email: "ahmed@example.com",
  name: "أحمد محمد",
  username: "ahmed",
  accountType: "writer",
} as const;

export const AUTH_RESPONSE: AuthResponse = {
  user: { ...AUTH_USER },
  tokens: { accessToken: "access-token", refreshToken: "refresh-token" },
};

export const SESSION_RESPONSE: SessionResponse = {
  user: { ...AUTH_USER },
  expiresAt: "2026-01-01T00:15:00.000Z",
};

export const STORY: Story = {
  id: "story-1",
  title: "ليلة في الحارة",
  slug: "layla-fi-lharra",
  excerpt: "مقتطف من القصة",
  content: "<p>نص القصة</p>",
  coverImage: null,
  status: "published",
  category: "fiction",
  tags: ["غموض"],
  views: 1500,
  reactions: 42,
  author: { id: "user-1", name: "أحمد محمد" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

export const STORY_RECORD: StoryRecord = {
  id: "story-1",
  authorId: "user-1",
  authorName: null,
  title: "ليلة في الحارة",
  slug: "layla-fi-lharra",
  excerpt: "مقتطف من القصة",
  content: "<p>نص القصة</p>",
  coverImage: null,
  status: "published",
  categoryId: "fiction",
  viewCount: 1500,
  likeCount: 42,
  commentCount: 3,
  readingTime: 5,
  publishedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

export const BOOK: Book = {
  id: "book-1",
  title: "ألفاظ",
  author: "إبراهيم الكوني",
  description: "رواية",
  coverImage: null,
  isbn: "9780000000001",
  publisher: "دار",
  publishDate: "2020-01-01T00:00:00.000Z",
  language: "ar",
  pageCount: 300,
  fileUrl: null,
  fileType: null,
  // PIASTRES, like every amount the API sends: 2500 piastres = 25.00 EGP.
  price: 2500,
  isFree: false,
  status: "published",
  categoryId: "literature",
  views: 900,
  likes: 12,
  downloads: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

export const BOOK_RECORD: BookRecord = {
  id: "book-1",
  title: "ألفاظ",
  author: "إبراهيم الكوني",
  description: "رواية",
  coverImage: null,
  isbn: "9780000000001",
  publisher: "دار",
  publishDate: "2020-01-01T00:00:00.000Z",
  language: "ar",
  pageCount: 300,
  fileUrl: null,
  fileType: null,
  // PIASTRES, like every amount the API sends: 2500 piastres = 25.00 EGP.
  price: 2500,
  isFree: false,
  status: "published",
  categoryId: "literature",
  viewCount: 900,
  likeCount: 12,
  downloadCount: 4,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

export const PAYMENT: Payment = {
  id: "payment-1",
  userId: "user-1",
  amount: 100,
  currency: "EGP",
  status: "completed",
  paymentMethod: "card",
  paymobOrderId: "order-1",
  paymobPaymentId: "pay-1",
  paymobTransactionId: "txn-1",
  description: "شراء كتاب",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
};

export const NOTIFICATION: Notification = {
  id: "notification-1",
  userId: "user-1",
  type: "story_reaction",
  title: "تفاعل جديد",
  message: "أعجب someone بقصتك",
  data: { storyId: "story-1" },
  isRead: false,
  readAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
};
