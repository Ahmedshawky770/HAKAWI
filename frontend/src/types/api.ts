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
  author: {
    id: string;
    name: string;
  };
  cover?: string;
  price?: number;
  category?: string;
  description?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookId: string;
  buyerId: string;
  salePrice: number;
  purchasedAt: string;
}

export interface Rental {
  id: string;
  bookId: string;
  renterId: string;
  rentalPrice: number;
  startDate: string;
  endDate: string;
}

export interface Contest {
  id: string;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  prizeType: string;
  prizeValue: string;
  rules: string;
  status: string;
  createdAt: string;
}

export interface ContestEntry {
  id: string;
  contestId: string;
  authorId: string;
  storyId: string;
  status: string;
  submittedAt: string;
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
  createdAt: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}
