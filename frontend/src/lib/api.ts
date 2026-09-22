import { AuthTokens, ApiError, Story, Book, Payment, Rental, Contest, ContestEntry, Notification, Conversation, Message } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const tokens = localStorage.getItem("hakawi_tokens");
  if (!tokens) return null;
  try {
    const parsed: AuthTokens = JSON.parse(tokens);
    return parsed.accessToken;
  } catch {
    return null;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("hakawi_tokens");
    }
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
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return handleResponse<T>(response);
}

export const api = {
  request: <T,>(endpoint: string, options: RequestInit = {}): Promise<T> =>
    apiRequest<T>(endpoint, options),

  // Auth
  register: (data: {
    email: string;
    password: string;
    name: string;
    username: string;
  }) =>
    apiRequest<{ user: { id: string; email: string; name: string }; token: AuthTokens }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  login: (data: { email: string; password: string }) =>
    apiRequest<{ user: { id: string; email: string }; token: AuthTokens }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  refreshToken: (refreshToken: string) =>
    apiRequest<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  // Users
  getUser: (id: string) =>
    apiRequest<{
      id: string;
      username: string;
      name: string;
      avatar?: string;
      bio?: string;
      accountType: string;
      stats?: { storiesCount: number; followersCount: number; followingCount: number };
    }>(`/users/${id}`),

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

  purchaseBook: (id: string, paymentMethodId: string) =>
    apiRequest<Payment>(`/books/${id}/purchase`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId }),
    }),

  rentBook: (id: string, data: { duration: string; paymentMethodId: string }) =>
    apiRequest<Rental>(`/books/${id}/rent`, {
      method: "POST",
      body: JSON.stringify(data),
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
};
