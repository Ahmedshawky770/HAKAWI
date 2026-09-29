import {
  AuthTokens,
  ApiError,
  User,
  Story,
  Book,
  Payment,
  Rental,
  Contest,
  ContestEntry,
  Notification,
  Conversation,
  Message,
  Follow,
  Reaction,
  Comment,
  ReactionType,
  SearchResult,
  UploadedFile,
  ModerationItem,
  LibraryItem,
  LibraryResponse,
  ReadingProgress,
} from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export function setStoredUser(user: { id: string; email: string; name: string; username?: string; accountType?: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem("hakawi_user", JSON.stringify(user));
}

export function getStoredUser(): { id: string; email: string; name: string; username?: string; accountType?: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("hakawi_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id: string; email: string; name: string; username?: string; accountType?: string };
  } catch {
    return null;
  }
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("hakawi_user");
  localStorage.removeItem("hakawi_tokens");
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearStoredUser();
    return Promise.reject(new Error("Unauthorized"));
  }
  const data = await response.json();
  if (!response.ok) {
    const apiError = data as ApiError;
    throw new Error(apiError.message || "An error occurred");
  }
  return data as T;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  return handleResponse<T>(response);
}

export const api = {
  request: <T,>(endpoint: string, options: RequestInit = {}): Promise<T> =>
    apiRequest<T>(endpoint, options),

  register: (data: {
    email: string;
    password: string;
    name: string;
    username: string;
  }) =>
    apiRequest<{ user: { id: string; email: string; name: string }; tokens: AuthTokens }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  login: (data: { email: string; password: string }) =>
    apiRequest<{ user: { id: string; email: string }; tokens: AuthTokens }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  refreshToken: (refreshToken: string) =>
    apiRequest<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  getSession: () =>
    apiRequest<{ id: string; email: string; name: string; username: string; accountType: string }>("/auth/session"),

  // Users
  getUser: (id: string) =>
    apiRequest<User>(`/users/${id}`),

  updateUser: (id: string, data: { name?: string; bio?: string }) =>
    apiRequest<{ id: string; name: string; bio?: string }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Stories
  listStories: (params?: { page?: number; limit?: number; category?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.category) searchParams.set("category", params.category);
    const qs = searchParams.toString();
    return apiRequest<{ stories: Story[]; total: number; page: number; limit: number }>(
      `/stories${qs ? `?${qs}` : ""}`
    );
  },

  getStory: (id: string) =>
    apiRequest<Story>(`/stories/${id}`),

  createStory: (data: {
    title: string;
    content: string;
    category: string;
    tags?: string[];
  }) =>
    apiRequest<{ id: string; title: string; status: string; createdAt: string }>("/stories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateStory: (id: string, data: { title?: string; content?: string; category?: string; tags?: string[] }) =>
    apiRequest<{ id: string; title: string; status: string; createdAt: string }>(`/stories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteStory: (id: string) =>
    apiRequest<void>(`/stories/${id}`, {
      method: "DELETE",
    }),

  // Books
  listBooks: () =>
    apiRequest<Book[]>("/books"),

  getBook: (id: string) =>
    apiRequest<Book>(`/books/${id}`),

  purchaseBook: (id: string, paymentMethodId?: string) =>
    apiRequest<Payment>(`/books/${id}/purchase`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId }),
    }),

  rentBook: (id: string, data: { durationDays: number }) =>
    apiRequest<Rental>(`/books/${id}/rent`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Reading Progress
  getReadingProgress: (bookId: string) =>
    apiRequest<ReadingProgress>(`/reading-progress?bookId=${bookId}`),

  // Library
  listLibrary: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return apiRequest<LibraryResponse>(`/library${qs ? `?${qs}` : ""}`);
  },

  getLibraryCount: () =>
    apiRequest<{ count: number }>("/library/count"),

  addToLibrary: (data: { bookId: string }) =>
    apiRequest<LibraryItem>("/library", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  removeFromLibrary: (id: string) =>
    apiRequest<void>(`/library/${id}`, { method: "DELETE" }),

  accessLibraryItem: (id: string) =>
    apiRequest<LibraryItem>(`/library/${id}/access`, {
      method: "POST",
    }),

  // Contests
  listContests: () =>
    apiRequest<Contest[]>("/contests"),

  getContest: (id: string) =>
    apiRequest<Contest>(`/contests/${id}`),

  createContest: (data: {
    title: string;
    description: string;
    category: string;
    startDate: string;
    endDate: string;
    submissionDeadline: string;
    prizeType: string;
    prizeValue: string;
    rules: string;
  }) =>
    apiRequest<{ id: string; title: string; status: string; createdAt: string }>("/contests", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitEntry: (contestId: string, storyId: string) =>
    apiRequest<ContestEntry>(`/contests/${contestId}/submit`, {
      method: "POST",
      body: JSON.stringify({ storyId }),
    }),

  // Notifications
  getNotifications: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return apiRequest<{ notifications: Notification[]; unreadCount: number }>(
      `/notifications${qs ? `?${qs}` : ""}`
    );
  },

  markNotificationAsRead: (id: string) =>
    apiRequest<{ id: string; isRead: boolean; readAt: string }>(`/notifications/${id}/read`, {
      method: "PATCH",
    }),

  // Messages
  getConversations: () =>
    apiRequest<{ conversations: Conversation[] }>("/messages/conversations"),

  getMessages: (conversationId: string) =>
    apiRequest<{ messages: Message[] }>(`/messages/conversations/${conversationId}/messages`),

  sendMessage: (conversationId: string, content: string) =>
    apiRequest<Message>(`/messages/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  // Payments
  getPaymentHistory: () =>
    apiRequest<Payment[]>("/payments"),

  getPayment: (id: string) =>
    apiRequest<Payment>(`/payments/${id}`),

  // Follow
  followUser: (userId: string) =>
    apiRequest<Follow>(`/users/${userId}/follow`, { method: "POST" }),

  unfollowUser: (userId: string) =>
    apiRequest<void>(`/users/${userId}/follow`, { method: "DELETE" }),

  getFollowers: (userId: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return apiRequest<{ follows: Follow[]; total: number; page: number; limit: number }>(
      `/users/${userId}/followers${qs ? `?${qs}` : ""}`
    );
  },

  getFollowing: (userId: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return apiRequest<{ follows: Follow[]; total: number; page: number; limit: number }>(
      `/users/${userId}/following${qs ? `?${qs}` : ""}`
    );
  },

  // Reactions
  getReactions: (storyId: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return apiRequest<{ reactions: Reaction[]; total: number; page: number; limit: number }>(
      `/stories/${storyId}/reactions${qs ? `?${qs}` : ""}`
    );
  },

  addReaction: (storyId: string, type: ReactionType) =>
    apiRequest<Reaction>(`/stories/${storyId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ type }),
    }),

  removeReaction: (storyId: string) =>
    apiRequest<void>(`/stories/${storyId}/reactions`, { method: "DELETE" }),

  // Comments
  getComments: (storyId: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return apiRequest<{ comments: Comment[]; total: number; page: number; limit: number }>(
      `/stories/${storyId}/comments${qs ? `?${qs}` : ""}`
    );
  },

  createComment: (storyId: string, data: { content: string; parentId?: string }) =>
    apiRequest<Comment>(`/stories/${storyId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateComment: (storyId: string, commentId: string, data: { content: string }) =>
    apiRequest<Comment>(`/stories/${storyId}/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteComment: (storyId: string, commentId: string) =>
    apiRequest<void>(`/stories/${storyId}/comments/${commentId}`, { method: "DELETE" }),

  // Search
  search: (params: { query: string; type?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.query);
    if (params.type) searchParams.set("type", params.type);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    return apiRequest<{ results: SearchResult[]; total: number; page: number; limit: number }>(
      `/search?${searchParams.toString()}`
    );
  },

  // Upload
  uploadFile: async (file: File): Promise<UploadedFile> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/upload`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    return handleResponse<UploadedFile>(response);
  },

  // Rentals
  createRental: (bookId: string, durationDays?: number) =>
    apiRequest<Rental>("/rentals", {
      method: "POST",
      body: JSON.stringify({ bookId, durationDays }),
    }),

  getMyRentals: (params?: { page?: number; limit?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    const qs = searchParams.toString();
    return apiRequest<{ rentals: Rental[]; total: number; page: number; limit: number }>(
      `/rentals/my${qs ? `?${qs}` : ""}`
    );
  },

  getRental: (id: string) =>
    apiRequest<Rental>(`/rentals/${id}`),

  extendRental: (id: string, extensionDays: number) =>
    apiRequest<Rental>(`/rentals/${id}/extend`, {
      method: "POST",
      body: JSON.stringify({ extensionDays }),
    }),

  returnRental: (id: string) =>
    apiRequest<Rental>(`/rentals/${id}/return`, {
      method: "POST",
    }),

  // Moderation
  getModerationQueue: (params?: { page?: number; limit?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    const qs = searchParams.toString();
    return apiRequest<{ items: ModerationItem[]; total: number; page: number; limit: number }>(
      `/moderation${qs ? `?${qs}` : ""}`
    );
  },

  moderateItem: (itemId: string, data: { status: "approved" | "rejected"; reason?: string }) =>
    apiRequest<ModerationItem>(`/moderation/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};
