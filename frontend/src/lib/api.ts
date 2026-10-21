import { z } from "zod";

import type { ReactionType, StoryMutationInput, StoryPatchInput } from "@hakawi/shared-types";

import { notifySessionChanged, notifySessionLost } from "@/lib/session-events";
import { MFA_TOKEN_HEADER, requestMfaCode } from "@/lib/mfa-step-up";

/**
 * THE SESSION'S SIGNALS, RE-EXPORTED HERE.
 *
 * They live in `lib/session-events.ts` so that a test suite which replaces
 * `@/lib/api` with a hand-written object does not take the signals with it —
 * and the re-export keeps the one import path this module always had.
 */
export { onSessionChanged, onSessionLost, notifySessionChanged, notifySessionLost } from "@/lib/session-events";

import {
  authResponseSchema,
  badgeCatalogSchema,
  bookCheckoutSchema,
  bookRecordResponseSchema,
  bookResponseSchema,
  booksListResponseSchema,
  commentSchema,
  commentsListResponseSchema,
  contestPrizesResponseSchema,
  contestSchema,
  contestSubmissionSchema,
  contestVoteSchema,
  contestVotesResponseSchema,
  contestsListResponseSchema,
  conversationsListResponseSchema,
  countResultSchema,
  downloadResponseSchema,
  emptyResponseSchema,
  followersResponseSchema,
  followSchema,
  followingResponseSchema,
  libraryItemSchema,
  libraryListResponseSchema,
  messageOnlySchema,
  messageSchema,
  messagesListResponseSchema,
  moderationStatsSchema,
  notificationSchema,
  notificationsListResponseSchema,
  paymentSchema,
  paymentsListResponseSchema,
  publicUserProfileSchema,
  publisherStatsSchema,
  publisherSubmissionsResponseSchema,
  publisherVotesResponseSchema,
  purchaseResultSchema,
  reactionSchema,
  reactionCountsSchema,
  reactionsListResponseSchema,
  readingProgressListResponseSchema,
  rentalQuoteSchema,
  rentalSchema,
  rentalsListResponseSchema,
  reportSchema,
  reportsListResponseSchema,
  restrictionsResponseSchema,
  searchResponseSchema,
  sessionResponseSchema,
  storiesListResponseSchema,
  storyRecordResponseSchema,
  storyResponseSchema,
  uploadTicketSchema,
  userBadgesResponseSchema,
  userStatsSchema,
} from "@/lib/schemas";
import { ApiError } from "@/lib/errors";

/**
 * The one API origin in the app. Every request goes through here, and so does the OAuth handshake
 * (`lib/oauth.ts`): the provider consent screens live on the API's own routes, so the two entry
 * points into the backend must not be able to name different hosts. It is exported for exactly
 * that reason and for no other — a caller that needs an API URL reads it from here rather than
 * repeating the environment lookup and its fallback.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

/**
 * How the reader is paying.
 *
 * TWO WORDS, NOT A HANDLE. The gateway's own identifier for a stored payment
 * instrument is a number the merchant's dashboard knows and the reader has
 * never seen, so it was never something the client could ask for — the earlier
 * free-text field asked the reader to type one, and the only outcome that
 * produced was a failed checkout. What the client can ask is the question the
 * reader can answer: card or wallet. The SERVER resolves the answer to this
 * merchant's gateway id, and a deployment that has not configured one simply
 * lets the gateway ask the customer, exactly as it did before the question
 * existed.
 *
 * The type lives here, in the module that speaks to the API, so that the wire
 * format and the dialog cannot drift apart: the dialog's `CheckoutMethod` is
 * this type under another name.
 */
export type PaymentMethodChoice = "card" | "wallet";

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
  notifySessionChanged();
}

/**
 * The parsed form of a stored session.
 */
function parseStoredUser(raw: string): StoredUser | null {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = storedUserSchema.safeParse(parsed);
  return candidate.success ? candidate.data : null;
}

/**
 * THE PARSE IS DONE ONCE, AND THE OBJECT IS THE SAME ONE EVERY TIME.
 *
 * The stored session is read by `useSyncExternalStore`, which compares the
 * snapshot it is given against the last one with `Object.is`. A new object
 * every time is a change every time: React renders, reads the snapshot, sees
 * a different object, and renders again — for ever. The read therefore
 * returns the SAME object for as long as the session it describes is
 * unchanged, and the comparison is over the RAW value, which is the thing
 * that actually changes.
 *
 * The raw value is one `getItem` away from the parsed one, and the parse
 * costs a `JSON.parse` and a schema validation — work that was being redone
 * on every read, at least twice per render, for every component that reads
 * the session.
 */
let cachedUserRaw: string | null = null;
let cachedUserRawRead = false;
let cachedUser: StoredUser | null = null;

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("hakawi_user");
  const present = raw !== null;
  if (present === cachedUserRawRead && raw === cachedUserRaw) return cachedUser;

  cachedUserRawRead = present;
  cachedUserRaw = raw;
  if (raw === null) {
    cachedUser = null;
    return cachedUser;
  }
  try {
    cachedUser = parseStoredUser(raw);
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("hakawi_user");
  localStorage.removeItem("hakawi_tokens");
  notifySessionChanged();
}



/**
 * Subscribe to the loss of a session.
 *
 * @returns the function that cancels the subscription.
 */

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

/**
 * ONE FIELD OF AN ERROR BODY, READ AS A SENTENCE.
 *
 * NestJS puts the reason in `message` — a STRING ("Invalid email or
 * password"), an ARRAY of strings, or an OBJECT that carries its own `message`
 * ("CAPTCHA verification required") — and the per-field reasons in `details`,
 * whose entries are `{field, message}`. The object form used to fail the whole
 * parse, so the server's own wording was lost and the client had nothing to
 * classify — which is why the error classifier in `lib/errors.ts` never saw the
 * reason a request was refused.
 *
 * EVERY FIELD IS READ ON ITS OWN. The body used to be parsed as ONE schema, so
 * a single malformed field — a `details` array of strings instead of objects,
 * a `message` object without a string inside it — failed the whole parse and
 * the server's wording was lost again, which is the same defect one level
 * down. A body is a bag of fields here, not a contract: each is asked in
 * turn, and the first one that yields a sentence wins.
 */
function readMessageField(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const message = readMessageField(entry);
      if (message) return message;
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    return readMessageField((value as Record<string, unknown>).message);
  }
  return null;
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) return null;
  return payload as Record<string, unknown>;
}

/**
 * The server's own words, or `null` when it said nothing usable.
 *
 * `null` and not a generic sentence: the caller decides what a missing reason
 * means. A 401 without a body means the session is gone; a 500 without a body
 * means the server is unwell. One generic string for both is what made the
 * client's answer to a wrong password wrong.
 */
function readErrorMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  if (record === null) return null;

  // `details` is the most precise: it names the FIELD that was refused. Only
  // the OBJECT form is read — NestJS's per-field reason is
  // `{field, message}` — so a `details` array of bare strings, which says
  // nothing about which field it is talking about, cannot cost the reader the
  // sentence in `message`.
  const details = record.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      const message = readMessageField(asRecord(detail)?.message);
      if (message) return message;
    }
  }

  const message = readMessageField(record.message);
  if (message) return message;

  const error = readMessageField(record.error);
  if (error) return error;

  return null;
}

/**
 * The per-field reasons, for the error's own record.
 *
 * Read one entry at a time, and a malformed entry costs that entry only.
 */
function readErrorDetails(payload: unknown): string[] {
  const record = asRecord(payload);
  if (record === null) return [];
  const details = record.details;
  if (!Array.isArray(details)) return [];

  const collected: string[] = [];
  for (const detail of details) {
    const message = readMessageField(asRecord(detail)?.message);
    if (!message) continue;
    const field = asRecord(detail)?.field;
    collected.push(typeof field === "string" && field.length > 0 ? `${field}: ${message}` : message);
  }
  return collected;
}

/**
 * Whether the server is asking for a SECOND FACTOR before it will let the request through.
 *
 * The routes that ask for one — the financial ones, the moderation ones, the admin
 * break-glass one — refuse the request with a 401 whose body says `MFA_CHALLENGE_REQUIRED`.
 * A 401 that used to be read as a lost session, so a reader who wanted to do something that
 * needs a code from their phone was signed out for it. The refusal is now recognised as what
 * it is, the reader is asked for the code, and the request is made again with it.
 */
function readMfaChallenge(payload: unknown): boolean {
  const record = asRecord(payload);
  if (record === null) return false;
  if (record.code === "MFA_CHALLENGE_REQUIRED") return true;
  const message = readMessageField(record.message);
  return message !== null && message.toLowerCase().includes("mfa challenge");
}

/**
 * Whether the server is asking for a CAPTCHA before it will let the reader in.
 *
 * The server answers a sign-in that is under a CAPTCHA watch with a 401 and a
 * body that says so (`backend/src/modules/auth/auth.service.ts`). The flag is
 * carried on the error so the sign-in screen can ask for the CAPTCHA instead of
 * telling the reader their password is wrong.
 */
function readCaptchaRequired(payload: unknown): boolean {
  const record = asRecord(payload);
  if (record === null) return false;
  if (record.captchaRequired === true) return true;
  if (record.code === "CAPTCHA_REQUIRED") return true;
  const message = readMessageField(record.message);
  return message !== null && message.toLowerCase().includes("captcha");
}

/**
 * THE PROVIDER AND THE SITE KEY THE SERVER ASKED FOR.
 *
 * The server names both, and both are facts about the deployment: which script to load
 * and which tenant the widget belongs to. A reader cannot be asked for a CAPTCHA
 * without them.
 */
function readCaptchaDetails(payload: unknown): { provider: string | null; siteKey: string | null } {
  const record = asRecord(payload);
  if (record === null) return { provider: null, siteKey: null };
  const provider = typeof record.captchaProvider === "string" ? record.captchaProvider : null;
  const siteKey = typeof record.captchaSiteKey === "string" ? record.captchaSiteKey : null;
  return { provider, siteKey };
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

/**
 * HOW A REQUEST IS CLASSIFIED BEFORE IT IS SENT.
 *
 * `establishingSession` is the one fact about the request that changes what a
 * 401 MEANS. A request that is part of establishing a session — signing in,
 * signing up — cannot end a session, because the session it would end is not
 * the one the request is about.
 */
export interface ApiRequestOptions extends RequestInit {
  /**
   * TRUE when this request is part of ESTABLISHING a session rather than USING
   * one.
   *
   * A refused sign-in is a fact about the ATTEMPT. It must not destroy the
   * session the reader already has: the reader who opens the sign-in screen to
   * switch accounts and mistypes a password would lose the session that was
   * working, and would be evicted a quarter of an hour later with no way to
   * refresh the token.
   */
  establishingSession?: boolean;
  /**
   * The reader's SECOND FACTOR, for a route that demands one.
   *
   * The code is never written down and never sent anywhere but the route that
   * asked for it: it travels in the `X-MFA-Token` header, exactly once, on the
   * request that was refused. The API verifies the code against the reader's
   * own secret, so the server keeps no copy of it either.
   */
  mfaToken?: string;
}

async function handleResponse<S extends z.ZodTypeAny>(
  response: Response,
  schema: S,
  endpoint: string,
  options: { establishingSession: boolean },
): Promise<z.infer<S>> {
  // The body is read FIRST, and always. A 401 is the one answer whose wording
  // decides what the reader is told: "Invalid email or password",
  // "Account has been disabled" and "Invalid session" are three different
  // facts, and they are all the same status. Throwing before the body was read
  // turned every one of them into "Unauthorized", which the classifier in
  // `lib/errors.ts` then read as an expired session — so a wrong password was
  // answered with "your session has ended".
  const payload: unknown = decodeBody(await response.text());

  if (response.status === 401) {
    // A REFUSED SIGN-IN IS NOT AN ENDED SESSION.
    //
    // This is the rule the whole session story rests on, and it is decided
    // HERE, in the one layer that knows what the request was for. A request
    // that establishes a session cannot end one; every other 401 does.
    //
    // The verdict is recorded on the error and read by everybody else, so the
    // announcement ("the session is gone") and the decision ("the reader is
    // signed out") can never disagree — which is how a disabled account used
    // to be answered with a retry button that could never succeed, and how a
    // 401 that the classifier read differently left the previous reader's data
    // in the cache.
    const mfaChallenge = readMfaChallenge(payload);
    // A SECOND FACTOR IS NOT A LOST SESSION.
    //
    // The routes that demand one refuse the request with a 401, and the refusal says
    // "prove who you are once more" — not "your session is over". Treating it as the
    // end of the session would destroy a session that is alive: the reader would be
    // signed out for trying to do something that needs a code from their phone, and
    // the request they were making would never be made.
    const endsSession = !options.establishingSession && !mfaChallenge;
    const message = readErrorMessage(payload);

    const captcha = readCaptchaDetails(payload);
    const failure = new ApiError(message ?? "Unauthorized", 401, {
      details: readErrorDetails(payload),
      endsSession,
      captchaRequired: readCaptchaRequired(payload),
      captchaProvider: captcha.provider,
      captchaSiteKey: captcha.siteKey,
      mfaChallenge,
    });

    if (endsSession) {
      clearStoredUser();
      // The failure travels with the announcement, so a listener can say WHY
      // the session ended: "Account has been disabled" is a fact the reader
      // must be told, and it is in the server's own wording.
      notifySessionLost(failure);
    }

    throw failure;
  }

  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload) ?? "An error occurred", response.status, {
      details: readErrorDetails(payload),
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // A body the schema refuses is the server's contract breaking, not an
    // HTTP failure: there is no status to report, and the message says which
    // endpoint broke it.
    throw new ApiError(describeInvalidPayload(parsed.error, endpoint, payload), 502);
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
  options: ApiRequestOptions = {},
): Promise<z.infer<S>> {
  const { establishingSession = false, mfaToken, ...requestInit } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...requestInit.headers,
    // The second factor travels in the header the API reads. It is added only when
    // there is one, so an ordinary request carries nothing it does not need.
    ...(mfaToken === undefined ? {} : { [MFA_TOKEN_HEADER]: mfaToken }),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...requestInit,
    headers,
    credentials: "include",
  });

  try {
    return await handleResponse(response, schema, endpoint, { establishingSession });
  } catch (error) {
    // A SECOND FACTOR, NOT A LOST SESSION.
    //
    // The routes that demand one refuse the request with a 401, and a 401 has always
    // meant "the session is over". Read that way, a reader who wanted to do something
    // needing a code from their phone was told their session had ended and was thrown
    // to the sign-in screen — for a session that was alive and well.
    //
    // So the reader is asked for the code and the request is made again, ONCE. The retry
    // is not unbounded: a code the server refuses comes back as a refusal that is not a
    // challenge, and is reported as it is.
    if (error instanceof ApiError && error.mfaChallenge && mfaToken === undefined) {
      const code = await requestMfaCode();
      if (code !== null && code !== "") {
        return apiRequest(schema, endpoint, { ...options, mfaToken: code });
      }
    }
    throw error;
  }
}

/** The answer to a second-factor check. */
const mfaChallengeResponseSchema = z.object({
  verified: z.boolean(),
  backupCodeUsed: z.boolean().optional(),
});

export const api = {
  request: <S extends z.ZodTypeAny>(
    schema: S,
    endpoint: string,
    options: ApiRequestOptions = {},
  ): Promise<z.infer<S>> => apiRequest(schema, endpoint, options),

  register: (data: { email: string; password: string; name: string; username: string }) =>
    apiRequest(authResponseSchema, "/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      // Signing UP establishes a session; it cannot end one.
      establishingSession: true,
    }),

  login: (data: { email: string; password: string; captchaToken?: string | null }) =>
    apiRequest(authResponseSchema, "/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        // The token is sent only when there is one: the server asks for it by
        // refusing the sign-in, and a body with an empty token would be a
        // different request from one without the field.
        ...(data.captchaToken ? { captchaToken: data.captchaToken } : {}),
      }),
      // Signing IN establishes a session; it cannot end one. A wrong password
      // here must not delete the refresh token of the session that is working.
      establishingSession: true,
    }),

  /**
   * CHECK A SECOND FACTOR, WITHOUT DOING THE THING IT AUTHORISES.
   *
   * The reader is asked for a code, and the code is checked on its own — so that a code
   * the server refuses is refused WHILE THE PROMPT IS STILL OPEN, where the reader can
   * type another one, instead of arriving as a failure of the action they were trying to
   * do.
   */
  verifyMfaChallenge: (token: string) =>
    apiRequest(mfaChallengeResponseSchema, "/auth/mfa/challenge", {
      method: "POST",
      body: JSON.stringify({ token }),
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

  professionalRequest: () =>
    apiRequest(
      z.object({
        eligible: z.boolean(),
        reasons: z.array(z.string()),
      }),
      "/users/me/professional-request",
      { method: "POST" },
    ),

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

  /**
   * One story.
   *
   * The optional signal exists for the SERVER-side reads — the metadata of a
   * story, the link preview of a story — where the request happens while a
   * response is being held open. An unbounded fetch there turns an API that
   * is slow or down into a page that hangs until the proxy gives up, instead
   * of a page that degrades to the product's own title.
   */
  getStory: (id: string, options?: { signal?: AbortSignal }) =>
    apiRequest(storyResponseSchema, `/stories/${id}`, options),

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

  /**
   * Buys a book.
   *
   * WHAT TRAVELS IN THE BODY IS THE READER'S CHOICE, NOT A GATEWAY HANDLE.
   * The body carries `"card"` or `"wallet"` — the two words the reader picked —
   * and the SERVER resolves them to this merchant's own Paymob method id. The
   * reader never sees a gateway handle, and the API never accepts one: a
   * free-form `paymentMethodId` on the wire is a number the client could
   * invent, and the server would have had to trust it.
   */
  purchaseBook: (id: string, paymentMethod?: PaymentMethodChoice) =>
    apiRequest(purchaseResultSchema, `/books/${id}/purchase`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod }),
    }),

  /**
   * Starts a rental by CHARGING for it.
   *
   * This used to validate the response against `rentalSchema` and so expected an `Rental` — an
   * ACTIVE rental, granted with no payment. The API now returns the same checkout contract as
   * `purchaseBook`, and `RentalsEventHandler` creates the rental when `payment.completed` arrives, so
   * the customer is sent to Paymob rather than handed access.
   *
   * The instrument travels here too, and for the same reason it does for a
   * purchase: the panel asks the reader which instrument they are using, and a
   * rental that silently dropped the answer would be a question the product
   * asked and then ignored.
   */
  rentBook: (id: string, data: { durationDays: number; paymentMethod?: PaymentMethodChoice }) =>
    apiRequest(bookCheckoutSchema, `/books/${id}/rent`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Price of an extension before any money moves; `POST /rentals/:id/extend` takes the payment. */
  quoteRentalExtension: (id: string, days: number) =>
    apiRequest(rentalQuoteSchema, withQuery(`/rentals/${id}/extend/quote`, { days })),

  getReadingProgress: (bookId: string) =>
    apiRequest(readingProgressListResponseSchema, withQuery("/reading-progress", { bookId })),

  listLibrary: (params?: { page?: number; limit?: number }) =>
    apiRequest(libraryListResponseSchema, withQuery("/library", { page: params?.page, limit: params?.limit })),

  getLibraryCount: () => apiRequest(countResultSchema, "/library/count"),

  /**
   * Claim a free book into the reader's library.
   *
   * WHY THIS CALLS `/library/claim` RATHER THAN `/library`. The old `POST /library` route
   * accepted `{ bookId }` with no check that the book was free, no check that a payment had
   * completed, and no check that the book was for sale. It was removed entirely because any
   * authenticated account could grant itself ownership of a paid book for nothing. The replacement
   * verifies `is_free` in the service, so a paid book can only be obtained through money.
   */
  claimLibraryItem: (data: { bookId: string }) =>
    apiRequest(libraryItemSchema, "/library/claim", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  removeFromLibrary: (id: string) => apiRequest(emptyResponseSchema, `/library/${id}`, { method: "DELETE" }),

  accessLibraryItem: (id: string) =>
    apiRequest(libraryItemSchema, `/library/${id}/access`, {
      method: "POST",
    }),

  createBook: (data: {
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
    isFree?: boolean;
    categoryId?: string;
  }) =>
    apiRequest(bookRecordResponseSchema, "/books", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  publishBook: (id: string) =>
    apiRequest(bookRecordResponseSchema, `/books/${id}/publish`, {
      method: "POST",
    }),

  archiveBook: (id: string) =>
    apiRequest(bookRecordResponseSchema, `/books/${id}/archive`, {
      method: "POST",
    }),

  deleteBook: (id: string) =>
    apiRequest(emptyResponseSchema, `/books/${id}`, {
      method: "DELETE",
    }),

  findBookByIsbn: (isbn: string) =>
    apiRequest(bookResponseSchema, `/books/isbn/${encodeURIComponent(isbn)}`),

  downloadBook: (id: string) =>
    apiRequest(downloadResponseSchema, `/books/${id}/download`, {
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

  castVote: (contestId: string, submissionId: string) =>
    apiRequest(contestVoteSchema, `/contests/${contestId}/votes`, {
      method: "POST",
      body: JSON.stringify({ submissionId }),
    }),

  getVotes: (contestId: string, params?: { submissionId?: string; page?: number; limit?: number }) =>
    apiRequest(
      contestVotesResponseSchema,
      withQuery(`/contests/${contestId}/votes`, {
        submissionId: params?.submissionId,
        page: params?.page,
        limit: params?.limit,
      }),
    ),

  selectWinner: (contestId: string, data: { submissionId: string; winnerId: string }) =>
    apiRequest(contestSchema, `/contests/${contestId}/winner`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  distributePrize: (contestId: string, data: {
    submissionId: string;
    winnerId: string;
    prizeType: string;
    prizeDescription?: string;
    amount?: number;
    currency?: string;
  }) =>
    apiRequest(contestPrizesResponseSchema, `/contests/${contestId}/prizes`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getPrizes: (contestId: string) =>
    apiRequest(contestPrizesResponseSchema, `/contests/${contestId}/prizes`),

  getPublisherStats: () => apiRequest(publisherStatsSchema, "/contests/publisher/stats"),

  getPublisherSubmissions: (contestId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      publisherSubmissionsResponseSchema,
      withQuery(`/contests/publisher/${contestId}/submissions`, {
        page: params?.page,
        limit: params?.limit,
      }),
    ),

  getPublisherVotes: (contestId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      publisherVotesResponseSchema,
      withQuery(`/contests/publisher/${contestId}/votes`, {
        page: params?.page,
        limit: params?.limit,
      }),
    ),

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

  listBadges: () => apiRequest(badgeCatalogSchema, "/badges"),

  listUserBadges: (userId: string, params?: { key?: string }) =>
    apiRequest(userBadgesResponseSchema, withQuery(`/badges/users/${userId}`, { key: params?.key })),

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

  /**
   * WHY THE SOCIAL CALLS BELOW DO NOT NEST UNDER `/users` OR `/stories`.
   *
   * Each of these features has its OWN top-level controller in the backend — `@Controller('follows')`,
   * `@Controller('reactions')`, `@Controller('comments')` — under the `api/v1` global prefix
   * (`backend/src/main.ts:101`). The client previously addressed them as if they were sub-resources
   * of the actor (`/users/:id/follow`) or of the story (`/stories/:id/reactions`), which is the
   * shape the REST *intuition* suggests and the shape the backend does not serve, so every
   * follow / react / comment action in the web client answered 404. `api.test.ts` asserted those
   * same invented URLs, so the suite was green while the feature was dead: the test and the bug
   * agreed with each other.
   *
   * The owning controller and file for each route is named next to the call, and
   * `api.contract.test.ts` pins every one of them to the literal path so the pair cannot drift
   * apart again.
   */
  // `backend/src/modules/follows/controllers/follows.controller.ts` → `FollowsController`:
  // `@Post()` on `@Controller('follows')`.
  //
  // The target of the follow is in the BODY, not the path, because the follower is never the
  // target: `FollowsController.follow` reads the follower from `req.user.sub` and takes only the
  // followed user from `FollowUserDto.followingId`
  // (`backend/src/modules/follows/dto/follows.dto.ts:3-6`). `followSchema` replaces the previous
  // `z.unknown()`, which accepted any body at all and so could not report a server that answered a
  // different route than the one that was asked for.
  followUser: (userId: string) =>
    apiRequest(followSchema, "/follows", {
      method: "POST",
      body: JSON.stringify({ followingId: userId }),
    }),

  // `FollowsController` → `@Delete(':followingId')`. Answers `{ message: 'Unfollowed successfully' }`.
  unfollowUser: (userId: string) => apiRequest(messageOnlySchema, `/follows/${userId}`, { method: "DELETE" }),

  // `FollowsController` → `@Get('user/:userId/followers')`, returning `{ followers, total, page, limit }`.
  getFollowers: (userId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      followersResponseSchema,
      withQuery(`/follows/user/${userId}/followers`, { page: params?.page, limit: params?.limit }),
    ),

  // `FollowsController` → `@Get('user/:userId/following')`, returning `{ following, total, page, limit }`.
  getFollowing: (userId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      followingResponseSchema,
      withQuery(`/follows/user/${userId}/following`, { page: params?.page, limit: params?.limit }),
    ),

  // `backend/src/modules/reactions/controllers/reactions.controller.ts` → `ReactionsController`:
  // `@Controller('reactions')` with `@Get('stories/:storyId')`.
  getReactions: (storyId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      reactionsListResponseSchema,
      withQuery(`/reactions/stories/${storyId}`, { page: params?.page, limit: params?.limit }),
    ),

  // `ReactionsController` → `@Get('stories/:storyId/counts')`. Not a paginated route, so no query string.
  getReactionCounts: (storyId: string) => apiRequest(reactionCountsSchema, `/reactions/stories/${storyId}/counts`),

  // `ReactionsController` → `@Post('stories/:storyId')` with `CreateReactionDto.type`
  // (`backend/src/modules/reactions/dto/reactions.dto.ts:3-8`).
  addReaction: (storyId: string, type: ReactionType) =>
    apiRequest(reactionSchema, `/reactions/stories/${storyId}`, {
      method: "POST",
      body: JSON.stringify({ type }),
    }),

  // `ReactionsController` → `@Delete('stories/:storyId')`. Answers `{ message: 'Reaction removed' }`.
  removeReaction: (storyId: string) =>
    apiRequest(messageOnlySchema, `/reactions/stories/${storyId}`, { method: "DELETE" }),

  // `backend/src/modules/comments/controllers/comments.controller.ts` → `CommentsController`:
  // `@Controller('comments')` with `@Get('story/:storyId')`.
  getComments: (storyId: string, params?: { page?: number; limit?: number }) =>
    apiRequest(
      commentsListResponseSchema,
      withQuery(`/comments/story/${storyId}`, { page: params?.page, limit: params?.limit }),
    ),

  /**
   * WHY `storyId` MOVES INTO THE BODY AND NOT INTO THE PATH.
   *
   * `CommentsController` declares `@Post()` on the bare `@Controller('comments')` — the collection,
   * not a story sub-route — and `CreateCommentDto` (`backend/src/modules/comments/dto/comments.dto.ts:3-15`)
   * carries `storyId` as a validated body field. Nest cannot route a collection `POST` on a path
   * parameter that the controller does not declare, so the old path 404'd and the old body was
   * missing the field the DTO requires (a 400 even if the route had matched).
   *
   * The public signature is UNCHANGED, so callers keep passing the story id positionally.
   */
  createComment: (storyId: string, data: { content: string; parentId?: string }) =>
    apiRequest(commentSchema, "/comments", {
      method: "POST",
      body: JSON.stringify({ storyId, content: data.content, parentId: data.parentId }),
    }),

  /**
   * WHY `storyId` IS STILL A PARAMETER BUT IS NO LONGER SENT.
   *
   * `CommentsController` addresses an update as `@Patch(':id')` — the comment is the resource and
   * the story is not part of its identity, so there is nowhere in the request for a story id. The
   * parameter is kept because every caller already passes it and removing it would be a breaking
   * signature change for a bug fix; it is documented here so its absence from the request is a
   * decision rather than an oversight. `data` is `UpdateCommentDto`, which is `{ content }`.
   */
  updateComment: (storyId: string, commentId: string, data: { content: string }) =>
    apiRequest(commentSchema, `/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Same reasoning as `updateComment`: `CommentsController` → `@Delete(':id')`. */
  deleteComment: (storyId: string, commentId: string) =>
    apiRequest(messageOnlySchema, `/comments/${commentId}`, { method: "DELETE" }),

  /**
   * WHY `query` AND NOT `q`.
   *
   * `SearchController.search` binds `@Query() query: SearchFiltersDto`, and the field on that DTO
   * is `query` (`backend/src/modules/search/dto/search.dto.ts:12-15`). The global `ValidationPipe`
   * runs with `forbidNonWhitelisted: true` (`backend/src/main.ts:147-156`), so a `q` parameter is
   * not ignored — it is a 400, which the search page renders as an empty result set. (`q` IS a
   * real field, but on the sibling `SearchAuthorsQueryDto` for `GET /search/authors`, which is a
   * different route and is not the one this function calls.)
   */
  search: (params: { query: string; category?: string; tag?: string; page?: number; limit?: number }) =>
    apiRequest(
      searchResponseSchema,
      withQuery("/search", {
        query: params.query,
        category: params.category,
        tag: params.tag,
        page: params.page,
        limit: params.limit,
      }),
    ),

  uploadFile: async (file: File, options?: { storyId?: string }) => {
    const isPdf = file.type === 'application/pdf';
    const endpoint = isPdf ? '/upload/pdf' : '/upload/image';

    const generateUploadUrlSchema = z.object({
      filename: z.string(),
      originalName: z.string(),
      mimetype: z.string(),
      size: z.number(),
      url: z.string(),
      cdnUrl: z.string().optional(),
    });

    const presignedResponse = await apiRequest(generateUploadUrlSchema, endpoint, {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });

    const uploadResponse = await fetch(presignedResponse.url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload to storage failed: ${uploadResponse.statusText}`);
    }

    return apiRequest(uploadTicketSchema, '/upload/confirm', {
      method: 'POST',
      body: JSON.stringify({
        filename: presignedResponse.filename,
        originalName: file.name,
        mimetype: file.type,
        size: file.size,
        storyId: options?.storyId,
      }),
    });
  },

  /**
   * A rental starts by CHARGING for it — `POST /books/:id/rent` returns a checkout, and the
   * backend creates the rental only when the payment completes. There is deliberately no
   * `createRental` client for `POST /rentals`: that route created an ACTIVE rental for no money
   * and was removed. The frontend makes NO call to `POST /rentals` anywhere in this tree —
   * `grep "POST /rentals" frontend/src` returns only the remove-rental and extend-return routes
   * under `/rentals/:id/...`, which remain.
   */
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
      withQuery("/moderation/reports", { page: params?.page, limit: params?.limit, status: params?.status }),
    ),

  moderateItem: (itemId: string, data: { status: "open" | "in_review" | "resolved" | "dismissed" }) =>
    apiRequest(reportSchema, `/moderation/reports/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  createReport: (data: { targetId: string; targetType: "story" | "comment" | "user"; reason: string; description?: string }) =>
    apiRequest(reportSchema, "/moderation/reports", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getUserRestrictions: (userId: string, params?: { includeExpired?: boolean }) =>
    apiRequest(
      restrictionsResponseSchema,
      withQuery(`/moderation/users/${userId}/restrictions`, {
        includeExpired: params?.includeExpired ? "true" : undefined,
      }),
    ),

  getModerationStats: () => apiRequest(moderationStatsSchema, "/moderation/stats"),
};
