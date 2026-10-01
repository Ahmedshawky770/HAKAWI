import { z } from "zod";

import type { ReactionType, StoryMutationInput, StoryPatchInput } from "@hakawi/shared-types";

import {
  authResponseSchema,
  bookResponseSchema,
  booksListResponseSchema,
  commentSchema,
  commentsListResponseSchema,
  contestSchema,
  contestSubmissionSchema,
  contestsListResponseSchema,
  conversationsListResponseSchema,
  countResultSchema,
  emptyResponseSchema,
  followersResponseSchema,
  followingResponseSchema,
  libraryItemSchema,
  libraryListResponseSchema,
  messageOnlySchema,
  messageSchema,
  messagesListResponseSchema,
  notificationSchema,
  notificationsListResponseSchema,
  paymentSchema,
  paymentsListResponseSchema,
  publicUserProfileSchema,
  purchaseResultSchema,
  reactionSchema,
  reactionCountsSchema,
  reactionsListResponseSchema,
  readingProgressListResponseSchema,
  rentalSchema,
  rentalsListResponseSchema,
  reportSchema,
  reportsListResponseSchema,
  searchResponseSchema,
  sessionResponseSchema,
  storiesListResponseSchema,
  storyRecordResponseSchema,
  storyResponseSchema,
  uploadTicketSchema,
  userStatsSchema,
} from "@/lib/schemas";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

const storedUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  username: z.string().optional(),
  accountType: z.string().optional(),
});

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  username?: string;
  accountType?: string;
};

export function setStoredUser(user: StoredUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem("hakawi_user", JSON.stringify(user));
}

function parseStoredUser(raw: string): StoredUser | null {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = storedUserSchema.safeParse(parsed);
  return candidate.success ? candidate.data : null;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("hakawi_user");
  if (!raw) return null;
  try {
    return parseStoredUser(raw);
  } catch {
    return null;
  }
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("hakawi_user");
  localStorage.removeItem("hakawi_tokens");
}

const storedTokensSchema = z.object({
  refreshToken: z.string(),
});

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("hakawi_tokens");
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const tokens = storedTokensSchema.safeParse(parsed);
    return tokens.success ? tokens.data.refreshToken : null;
  } catch {
    return null;
  }
}

const apiErrorMessageSchema = z.union([z.string(), z.array(z.string())]);

const apiErrorSchema = z.object({
  message: apiErrorMessageSchema.optional(),
  error: apiErrorMessageSchema.optional(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: apiErrorMessageSchema,
      }),
    )
    .optional(),
});

function firstMessage(value: z.infer<typeof apiErrorMessageSchema> | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  const [first] = value;
  return first ?? null;
}

function readErrorMessage(payload: unknown): string {
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    const [firstDetail] = parsed.data.details ?? [];
    if (firstDetail) {
      const detailMessage = firstMessage(firstDetail.message);
      if (detailMessage) return detailMessage;
    }
    const message = firstMessage(parsed.data.message ?? null);
    if (message) return message;
    const error = firstMessage(parsed.data.error ?? null);
    if (error) return error;
  }
  return "An error occurred";
}

function decodeBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    const decoded: unknown = JSON.parse(text);
    return decoded;
  } catch {
    return undefined;
  }
}

const MAX_REPORTED_ISSUES = 3;
const MAX_RECEIVED_LENGTH = 200;

function truncate(value: string, limit = MAX_RECEIVED_LENGTH): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function describeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return truncate(JSON.stringify(value) ?? String(value));
  } catch {
    return truncate(String(value));
  }
}

function describeIssue(issue: z.ZodIssue, path: (string | number)[]): string {
  const label = path.length > 0 ? path.join(".") : "(root)";
  const received = "received" in issue ? issue.received : undefined;
  return `${label}: ${issue.message} (received ${describeValue(received)})`;
}

function collectIssues(error: z.ZodError, prefix: (string | number)[] = []): string[] {
  return error.issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_union") {
      return issue.unionErrors.flatMap((nested) => collectIssues(nested, path));
    }
    return [describeIssue(issue, path)];
  });
}

function describeInvalidPayload(error: z.ZodError, endpoint: string, payload: unknown): string {
  const issues = collectIssues(error);
  const shown = issues.slice(0, MAX_REPORTED_ISSUES);
  const remaining = issues.length - shown.length;
  const detail = shown.length > 0 ? shown.join("; ") : "the payload matched no branch of the schema";
  const overflow = remaining > 0 ? ` (+${remaining} more issue${remaining === 1 ? "" : "s"})` : "";
  return `Invalid server response: ${detail}${overflow} (endpoint ${endpoint}, received ${describeValue(payload)})`;
}

async function handleResponse<S extends z.ZodTypeAny>(
  response: Response,
  schema: S,
  endpoint: string,
): Promise<z.infer<S>> {
  if (response.status === 401) {
    clearStoredUser();
    throw new Error("Unauthorized");
  }

  const payload: unknown = decodeBody(await response.text());

  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(describeInvalidPayload(parsed.error, endpoint, payload));
  }
  return parsed.data;
}

function withQuery(endpoint: string, params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query.length > 0 ? `${endpoint}?${query}` : endpoint;
}

async function apiRequest<S extends z.ZodTypeAny>(
  schema: S,
  endpoint: string,
  options: RequestInit = {},
): Promise<z.infer<S>> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  return handleResponse(response, schema, endpoint);
}

async function apiUpload<S extends z.ZodTypeAny>(schema: S, endpoint: string, body: FormData): Promise<z.infer<S>> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    body,
    credentials: "include",
  });

  return handleResponse(response, schema, endpoint);
}

export const api = {
  request: <S extends z.ZodTypeAny>(schema: S, endpoint: string, options: RequestInit = {}): Promise<z.infer<S>> =>
    apiRequest(schema, endpoint, options),

  register: (data: { email: string; password: string; name: string; username: string }) =>
    apiRequest(authResponseSchema, "/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    apiRequest(authResponseSchema, "/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  refreshToken: (refreshToken: string) =>
    apiRequest(authResponseSchema, "/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  getSession: () => apiRequest(sessionResponseSchema, "/auth/session"),

  logout: (refreshToken?: string) =>
    apiRequest(messageOnlySchema, "/auth/logout", {
      method: "POST",
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }),

  getUser: (id: string) => apiRequest(publicUserProfileSchema, `/users/${id}`),

  getUserStats: (id: string) => apiRequest(userStatsSchema, `/users/${id}/stats`),

  updateUser: (id: string, data: { name?: string; bio?: string }) =>
    apiRequest(publicUserProfileSchema, `/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  listStories: (params?: { page?: number; limit?: number; category?: string }) =>
    apiRequest(
      storiesListResponseSchema,
      withQuery("/stories", {
        page: params?.page,
        limit: params?.limit,
        category: params?.category,
      }),
    ),

  getStory: (id: string) => apiRequest(storyResponseSchema, `/stories/${id}`),

  createStory: (data: StoryMutationInput) =>
    apiRequest(storyRecordResponseSchema, "/stories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateStory: (id: string, data: StoryPatchInput) =>
    apiRequest(storyRecordResponseSchema, `/stories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteStory: (id: string) =>
    apiRequest(emptyResponseSchema, `/stories/${id}`, {
      method: "DELETE",
    }),

  listBooks: (params?: { page?: number; limit?: number; categoryId?: string }) =>
    apiRequest(
      booksListResponseSchema,
      withQuery("/books", {
        page: params?.page,
        limit: params?.limit,
        categoryId: params?.categoryId,
      }),
    ),

  getBook: (id: string) => apiRequest(bookResponseSchema, `/books/${id}`),

  purchaseBook: (id: string, paymentMethodId?: string) =>
    apiRequest(purchaseResultSchema, `/books/${id}/purchase`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId }),
    }),

  rentBook: (id: string, data: { durationDays: number }) =>
    apiRequest(rentalSchema, `/books/${id}/rent`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getReadingProgress: (bookId: string) =>
    apiRequest(readingProgressListResponseSchema, withQuery("/reading-progress", { bookId })),

  listLibrary: (params?: { page?: number; limit?: number }) =>
    apiRequest(libraryListResponseSchema, withQuery("/library", { page: params?.page, limit: params?.limit })),

  getLibraryCount: () => apiRequest(countResultSchema, "/library/count"),

  addToLibrary: (data: { bookId: string }) =>
    apiRequest(libraryItemSchema, "/library", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  removeFromLibrary: (id: string) => apiRequest(emptyResponseSchema, `/library/${id}`, { method: "DELETE" }),

  accessLibraryItem: (id: string) =>
    apiRequest(libraryItemSchema, `/library/${id}/access`, {
      method: "POST",
    }),

  listContests: (params?: { page?: number; limit?: number }) =>
    apiRequest(contestsListResponseSchema, withQuery("/contests", { page: params?.page, limit: params?.limit })),

  getContest: (id: string) => apiRequest(contestSchema, `/contests/${id}`),

  createContest: (data: {
    title: string;
    description: string;
    categoryId: string;
    startDate: string;
    endDate: string;
    submissionDeadline: string;
  }) =>
    apiRequest(contestSchema, "/contests", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitEntry: (contestId: string, storyId: string) =>
    apiRequest(contestSubmissionSchema, `/contests/${contestId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ storyId }),
    }),

  getNotifications: (params?: { page?: number; limit?: number }) =>
    apiRequest(
      notificationsListResponseSchema,
      withQuery("/notifications", { page: params?.page, limit: params?.limit }),
    ),

  getUnreadNotificationCount: () => apiRequest(countResultSchema, "/notifications/unread-count"),

  markNotificationAsRead: (id: string) =>
    apiRequest(notificationSchema, `/notifications/${id}/read`, {
      method: "PATCH",
    }),

  getConversations: () => apiRequest(conversationsListResponseSchema, "/messages/conversations"),

  getMessages: (conversationId: string) =>
    apiRequest(messagesListResponseSchema, `/messages/conversations/${conversationId}/messages`),

  sendMessage: (conversationId: string, content: string) =>
    apiRequest(messageSchema, `/messages/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  getPaymentHistory: (params?: { page?: number; limit?: number }) =>
    apiRequest(paymentsListResponseSchema, withQuery("/payments", { page: params?.page, limit: params?.limit })),

  getPayment: (id: string) => apiRequest(paymentSchema, `/payments/${id}`),

  followUser: (userId: string) => apiRequest(z.unknown(), `/users/${userId}/follow`, { method: "POST" }),

  unfollowUser: (userId: string) => apiRequest(z.unknown(), `/users/${userId}/follow`, { method: "DELETE" }),

  getFollowers: (userId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      followersResponseSchema,
      withQuery(`/users/${userId}/followers`, { page: params?.page, limit: params?.limit }),
    ),

  getFollowing: (userId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      followingResponseSchema,
      withQuery(`/users/${userId}/following`, { page: params?.page, limit: params?.limit }),
    ),

  getReactions: (storyId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      reactionsListResponseSchema,
      withQuery(`/stories/${storyId}/reactions`, { page: params?.page, limit: params?.limit }),
    ),

  getReactionCounts: (storyId: string) => apiRequest(reactionCountsSchema, `/stories/${storyId}/reactions/counts`),

  addReaction: (storyId: string, type: ReactionType) =>
    apiRequest(reactionSchema, `/stories/${storyId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ type }),
    }),

  removeReaction: (storyId: string) =>
    apiRequest(messageOnlySchema, `/stories/${storyId}/reactions`, { method: "DELETE" }),

  getComments: (storyId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      commentsListResponseSchema,
      withQuery(`/stories/${storyId}/comments`, { page: params?.page, limit: params?.limit }),
    ),

  createComment: (storyId: string, data: { content: string; parentId?: string }) =>
    apiRequest(commentSchema, `/stories/${storyId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateComment: (storyId: string, commentId: string, data: { content: string }) =>
    apiRequest(commentSchema, `/stories/${storyId}/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteComment: (storyId: string, commentId: string) =>
    apiRequest(messageOnlySchema, `/stories/${storyId}/comments/${commentId}`, { method: "DELETE" }),

  search: (params: { query: string; category?: string; tag?: string; page?: number; limit?: number }) =>
    apiRequest(
      searchResponseSchema,
      withQuery("/search", {
        q: params.query,
        category: params.category,
        tag: params.tag,
        page: params.page,
        limit: params.limit,
      }),
    ),

  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload(uploadTicketSchema, "/upload", formData);
  },

  createRental: (bookId: string, durationDays?: number) =>
    apiRequest(rentalSchema, "/rentals", {
      method: "POST",
      body: JSON.stringify({ bookId, durationDays }),
    }),

  getMyRentals: (params?: { page?: number; limit?: number; status?: string }) =>
    apiRequest(
      rentalsListResponseSchema,
      withQuery("/rentals/my", { page: params?.page, limit: params?.limit, status: params?.status }),
    ),

  getRental: (id: string) => apiRequest(rentalSchema, `/rentals/${id}`),

  extendRental: (id: string, extensionDays: number) =>
    apiRequest(rentalSchema, `/rentals/${id}/extend`, {
      method: "POST",
      body: JSON.stringify({ extensionDays }),
    }),

  returnRental: (id: string) =>
    apiRequest(rentalSchema, `/rentals/${id}/return`, {
      method: "POST",
    }),

  getModerationQueue: (params?: { page?: number; limit?: number; status?: string }) =>
    apiRequest(
      reportsListResponseSchema,
      withQuery("/moderation", { page: params?.page, limit: params?.limit, status: params?.status }),
    ),

  moderateItem: (itemId: string, data: { status: "open" | "in_review" | "resolved" | "dismissed" }) =>
    apiRequest(reportSchema, `/moderation/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};
