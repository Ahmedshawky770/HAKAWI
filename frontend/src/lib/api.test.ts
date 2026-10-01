/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

import { jsonResponse } from "@/test-utils/support";
import {
  AUTH_RESPONSE,
  BOOK,
  BOOK_RECORD,
  NOTIFICATION,
  PAYMENT,
  SESSION_RESPONSE,
  STORY,
  STORY_RECORD,
} from "@/test-utils/fixtures";
import { api, clearStoredUser, getStoredRefreshToken, getStoredUser, setStoredUser, type StoredUser } from "@/lib/api";
import { countResultSchema, messageOnlySchema } from "@/lib/schemas";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const STORED_USER: StoredUser = {
  id: "user-1",
  email: "ahmed@example.com",
  name: "أحمد محمد",
  username: "ahmed",
  accountType: "writer",
};

function lastCall(): { url: string; init: RequestInit | undefined } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(call?.[0]), init: call?.[1] };
}

function lastBody(): unknown {
  const body = lastCall().init?.body;
  return typeof body === "string" ? JSON.parse(body) : body;
}

async function expectRejection(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toThrow(message);
}

describe("api client request handling", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the parsed payload of a successful response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 7 }));

    await expect(api.request(countResultSchema, "/library/count")).resolves.toEqual({ count: 7 });
  });

  it("sends JSON headers and the session cookie with every request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 0 }));

    await api.request(countResultSchema, "/library/count");

    const { init } = lastCall();
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("calls the configured API base url", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 0 }));

    await api.request(countResultSchema, "/library/count");

    expect(lastCall().url).toBe("http://localhost:3001/api/v1/library/count");
  });

  it("clears the stored user on an unauthorized response", async () => {
    setStoredUser(STORED_USER);
    fetchMock.mockResolvedValue(jsonResponse({ message: "Token expired" }, 401));

    await expectRejection(api.request(countResultSchema, "/library/count"), "Unauthorized");
    expect(getStoredUser()).toBeNull();
  });

  it("clears the refresh token of the stored session on an unauthorized response", async () => {
    window.localStorage.setItem("hakawi_tokens", JSON.stringify({ refreshToken: "r" }));
    fetchMock.mockResolvedValue(jsonResponse({ message: "Token expired" }, 401));

    await expectRejection(api.request(countResultSchema, "/library/count"), "Unauthorized");
    expect(window.localStorage.getItem("hakawi_tokens")).toBeNull();
  });

  it("does not run the schema for an unauthorized response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 3 }, 401));

    await expect(api.request(countResultSchema, "/library/count")).rejects.toThrow("Unauthorized");
  });

  it("throws the server message of a failed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Story not found" }, 404));

    await expectRejection(api.getStory("story-1"), "Story not found");
  });

  it("throws the error field of a failed response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));

    await expectRejection(api.getStory("story-1"), "Forbidden");
  });

  it("throws the first field detail of a validation failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ details: [{ field: "email", message: "email must be an email" }] }, 400),
    );

    await expectRejection(api.getStory("story-1"), "email must be an email");
  });

  it("falls back to a generic message for a failed response without a known shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }, 500));

    await expectRejection(api.getStory("story-1"), "An error occurred");
  });

  it("falls back to a generic message for a body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("upstream failure", { status: 502 }));

    await expectRejection(api.getStory("story-1"), "An error occurred");
  });

  it("surfaces the first entry of a Nest validation error array", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 400, message: ["email must be an email"] }, 400));

    await expectRejection(api.login({ email: "bad", password: "x" }), "email must be an email");
  });

  it("surfaces the first entry of a Nest validation array that carries several failures", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 400, message: ["password is too short", "username is required"] }, 400),
    );

    await expectRejection(api.login({ email: "bad", password: "x" }), "password is too short");
  });

  it("surfaces a string error field that carries several failures", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 400, error: ["password is too short", "username is required"] }, 400),
    );

    await expectRejection(api.login({ email: "bad", password: "x" }), "password is too short");
  });

  it("surfaces the first entry of a validation detail whose message is an array", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ details: [{ field: "email", message: ["email must be an email"] }] }, 400),
    );

    await expectRejection(api.getStory("story-1"), "email must be an email");
  });

  it("prefers a field detail over the top level message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          message: ["generic failure"],
          details: [{ field: "email", message: "email must be an email" }],
        },
        400,
      ),
    );

    await expectRejection(api.getStory("story-1"), "email must be an email");
  });

  it("falls back to the top level message when the detail array is empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 400, message: ["generic failure"], details: [] }, 400));

    await expectRejection(api.getStory("story-1"), "generic failure");
  });

  it("falls back to a generic message for an empty validation array", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 400, message: [] }, 400));

    await expectRejection(api.login({ email: "bad", password: "x" }), "An error occurred");
  });

  it("resolves undefined for an empty body of a delete request", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.deleteStory("story-1")).resolves.toBeUndefined();
  });

  it("rejects an empty body when the schema expects a payload", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await expectRejection(api.getUnreadNotificationCount(), "Invalid server response");
  });
});

describe("api client payload validation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("rejects a story whose counters arrive as strings", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, views: "1500" }));

    await expectRejection(api.getStory("story-1"), "Invalid server response");
  });

  it("rejects a story that is missing its author", async () => {
    const withoutAuthor = Object.fromEntries(Object.entries(STORY).filter(([key]) => key !== "author"));
    fetchMock.mockResolvedValue(jsonResponse(withoutAuthor));

    await expectRejection(api.getStory("story-1"), "Invalid server response");
  });

  it("rejects a login response without tokens", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ user: AUTH_RESPONSE.user }));

    await expectRejection(api.login({ email: "a@b.c", password: "x" }), "Invalid server response");
  });

  it("rejects a login response whose account type is unknown", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...AUTH_RESPONSE, user: { ...AUTH_RESPONSE.user, accountType: "wizard" } }),
    );

    await expectRejection(api.login({ email: "a@b.c", password: "x" }), "Invalid server response");
  });

  it("rejects a notification whose read flag is not a boolean", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        notifications: [{ ...NOTIFICATION, isRead: "no" }],
        total: 1,
        page: 1,
        limit: 20,
      }),
    );

    await expectRejection(api.getNotifications(), "Invalid server response");
  });

  it("rejects a payment whose amount is a string", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PAYMENT, amount: "100" }));

    await expectRejection(api.getPayment("payment-1"), "Invalid server response");
  });

  it("rejects a list response that is a bare array", async () => {
    fetchMock.mockResolvedValue(jsonResponse([NOTIFICATION]));

    await expectRejection(api.getNotifications(), "Invalid server response");
  });

  it("rejects a message only response that carries no message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await expectRejection(
      api.request(messageOnlySchema, "/stories/story-1/reactions", { method: "DELETE" }),
      "Invalid server response",
    );
  });

  it("reports the offending field path of a malformed payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PAYMENT, amount: "100" }));

    await expectRejection(api.getPayment("payment-1"), "Invalid server response: amount");
  });

  it("names the endpoint and the received payload in the malformed payload diagnostic", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PAYMENT, amount: "100" }));

    let message = "";
    try {
      await api.getPayment("payment-1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("endpoint /payments/payment-1");
    expect(message).toContain('"amount":"100"');
    expect(message).toContain("Expected number");
  });

  it("accepts a wire story whose author carries no name", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, author: { id: "user-1" } }));

    const story = await api.getStory("story-1");

    expect(story.author.id).toBe("user-1");
    expect(story.author.name).toBeNull();
  });

  it("resolves the real author name a record now carries", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY_RECORD, authorName: "أحمد محمد" }));

    const story = await api.getStory("story-1");

    expect(story.author).toEqual({ id: STORY_RECORD.authorId, name: "أحمد محمد" });
  });

  it("explains why a union schema rejected the payload instead of an empty field path", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, views: "1500", tags: "drama" }));

    let message = "";
    try {
      await api.getStory("story-1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("views");
    expect(message).toContain("tags");
    expect(message).toContain("endpoint /stories/story-1");
  });

  it("never leaves the field path of the diagnostic empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STORY, views: "1500", tags: "drama" }));

    let message = "";
    try {
      await api.getStory("story-1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toBe("Invalid server response: ");
    expect(message).toMatch(/Invalid server response: \S/);
  });

  it("reports the field path of a union schema that matches no branch", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "story-1", title: "ناقص" }));

    let message = "";
    try {
      await api.getStory("story-1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/Invalid server response: \S/);
    expect(message).toContain("endpoint /stories/story-1");
  });

  it("truncates a long received payload in the diagnostic", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PAYMENT, amount: "x".repeat(500) }));

    let message = "";
    try {
      await api.getPayment("payment-1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("…");
    expect(message).not.toContain("x".repeat(201));
    expect(message.length).toBeLessThan(600);
  });

  it("counts the issues it leaves out of the diagnostic", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...PAYMENT,
        amount: "100",
        currency: 5,
        status: {},
        paymentMethod: [],
      }),
    );

    let message = "";
    try {
      await api.getPayment("payment-1");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("+");
    expect(message).toContain("more issue");
  });

  it("names the endpoint of an empty body that the schema rejects", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    let message = "";
    try {
      await api.getUnreadNotificationCount();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("endpoint /notifications/unread-count");
    expect(message).toContain("received undefined");
  });
});

describe("api client normalization", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("normalizes a stored story record into the wire shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY_RECORD));

    const story = await api.getStory("story-1");

    expect(story.views).toBe(1500);
    expect(story.reactions).toBe(42);
    expect(story.category).toBe("fiction");
    expect(story.author.id).toBe("user-1");
  });

  it("passes a wire shaped story through unchanged", async () => {
    fetchMock.mockResolvedValue(jsonResponse(STORY));

    await expect(api.getStory("story-1")).resolves.toEqual(STORY);
  });

  it("normalizes every story of a list response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ stories: [STORY_RECORD], total: 1, page: 1, limit: 20 }));

    const result = await api.listStories({ page: 1, limit: 20 });

    expect(result.stories[0]?.views).toBe(1500);
    expect(result.stories[0]?.reactions).toBe(42);
    expect(result.stories[0]?.category).toBe("fiction");
  });

  it("normalizes a stored book record into the wire shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK_RECORD));

    const book = await api.getBook("book-1");

    expect(book.views).toBe(900);
    expect(book.likes).toBe(12);
    expect(book.downloads).toBe(4);
    expect(book.categoryId).toBe("literature");
  });

  it("passes a wire shaped book through unchanged", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    await expect(api.getBook("book-1")).resolves.toEqual(BOOK);
  });

  it("rejects a stored book record with a wrong download counter", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...BOOK_RECORD, downloadCount: "many" }));

    await expectRejection(api.getBook("book-1"), "Invalid server response");
  });

  it("returns the payment fields without renaming them", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAYMENT));

    await expect(api.getPayment("payment-1")).resolves.toEqual(PAYMENT);
  });

  it("returns the session user and its expiry", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SESSION_RESPONSE));

    await expect(api.getSession()).resolves.toEqual(SESSION_RESPONSE);
  });
});

describe("api client query building", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("omits undefined query parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ stories: [], total: 0, page: 1, limit: 20 }));

    await api.listStories({ page: 1, limit: 20 });

    expect(lastCall().url).toBe("http://localhost:3001/api/v1/stories?page=1&limit=20");
  });

  it("sends a category filter when one is selected", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ stories: [], total: 0, page: 1, limit: 20 }));

    await api.listStories({ page: 1, limit: 20, category: "poetry" });

    expect(lastCall().url).toContain("category=poetry");
  });

  it("sends no query string when no filter is selected", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ stories: [], total: 0, page: 1, limit: 20 }));

    await api.listStories();

    expect(lastCall().url).toBe("http://localhost:3001/api/v1/stories");
  });

  it("maps the search query onto the q parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, limit: 20, query: "harka", took: 3 }));

    await api.search({ query: "harka" });

    expect(lastCall().url).toContain("/search?q=harka");
  });

  it("returns the unread notification count", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 4 }));

    await expect(api.getUnreadNotificationCount()).resolves.toEqual({ count: 4 });
    expect(lastCall().url).toBe("http://localhost:3001/api/v1/notifications/unread-count");
  });

  it("sends a registration payload as JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(AUTH_RESPONSE, 201));

    await api.register({ email: "a@b.c", password: "p", name: "n", username: "u" });

    expect(lastCall().init?.method).toBe("POST");
    expect(lastBody()).toEqual({ email: "a@b.c", password: "p", name: "n", username: "u" });
  });
});

describe("api client uploads", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts the file as multipart form data", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        filename: "cover.png",
        originalName: "cover.png",
        mimetype: "image/png",
        size: 12,
        url: "https://cdn.example/cover.png",
      }),
    );

    const file = new File(["binary-content"], "cover.png", { type: "image/png" });
    const ticket = await api.uploadFile(file);

    expect(ticket.url).toBe("https://cdn.example/cover.png");
    const { init } = lastCall();
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
  });

  it("rejects an upload ticket without a url", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ filename: "cover.png" }));

    await expectRejection(api.uploadFile(new File(["x"], "cover.png")), "Invalid server response");
  });
});

describe("stored user", () => {
  it("stores the user as JSON in local storage", () => {
    setStoredUser(STORED_USER);
    expect(window.localStorage.getItem("hakawi_user")).toBe(JSON.stringify(STORED_USER));
  });

  it("reads back a stored user", () => {
    setStoredUser(STORED_USER);
    expect(getStoredUser()).toEqual(STORED_USER);
  });

  it("returns null when no user is stored", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("returns null for an empty stored value", () => {
    window.localStorage.setItem("hakawi_user", "");
    expect(getStoredUser()).toBeNull();
  });

  it("returns null for a stored value that is not JSON", () => {
    window.localStorage.setItem("hakawi_user", "not-json");
    expect(getStoredUser()).toBeNull();
  });

  it("returns null for a stored JSON string", () => {
    window.localStorage.setItem("hakawi_user", '"ahmed"');
    expect(getStoredUser()).toBeNull();
  });

  it("returns null for a stored JSON null", () => {
    window.localStorage.setItem("hakawi_user", "null");
    expect(getStoredUser()).toBeNull();
  });

  it("returns null for a stored JSON number", () => {
    window.localStorage.setItem("hakawi_user", "42");
    expect(getStoredUser()).toBeNull();
  });

  it("returns null for a stored user that misses the required fields", () => {
    window.localStorage.setItem("hakawi_user", JSON.stringify({ id: "user-1" }));
    expect(getStoredUser()).toBeNull();
  });

  it("keeps a stored user without the optional fields", () => {
    setStoredUser({ id: "user-1", email: "a@b.c", name: "أحمد" });
    expect(getStoredUser()).toEqual({ id: "user-1", email: "a@b.c", name: "أحمد" });
  });

  it("removes the stored user and its tokens", () => {
    setStoredUser(STORED_USER);
    window.localStorage.setItem("hakawi_tokens", JSON.stringify({ refreshToken: "r" }));

    clearStoredUser();

    expect(window.localStorage.getItem("hakawi_user")).toBeNull();
    expect(window.localStorage.getItem("hakawi_tokens")).toBeNull();
  });

  it("survives a server side render without a window", () => {
    vi.stubGlobal("window", undefined);

    expect(() => setStoredUser(STORED_USER)).not.toThrow();
    expect(getStoredUser()).toBeNull();
    expect(() => clearStoredUser()).not.toThrow();
    expect(getStoredRefreshToken()).toBeNull();

    vi.unstubAllGlobals();
  });
});

describe("logout request", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts to the logout endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Logged out" }));

    await api.logout("refresh-token");

    expect(lastCall().url).toBe("http://localhost:3001/api/v1/auth/logout");
    expect(lastCall().init?.method).toBe("POST");
    expect(lastBody()).toEqual({ refreshToken: "refresh-token" });
  });

  it("sends the session cookie so the server can clear it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Logged out" }));

    await api.logout();

    expect(lastCall().init?.credentials).toBe("include");
  });

  it("sends no refresh token when the client holds none", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Logged out" }));

    await api.logout();

    expect(lastBody()).toEqual({});
  });

  it("rejects when the server refuses the logout", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Invalid refresh token" }, 401));

    await expectRejection(api.logout(), "Unauthorized");
    expect(getStoredUser()).toBeNull();
  });
});

describe("stored refresh token", () => {
  it("returns null when no token is stored", () => {
    expect(getStoredRefreshToken()).toBeNull();
  });

  it("reads the refresh token back", () => {
    window.localStorage.setItem("hakawi_tokens", JSON.stringify({ refreshToken: "r" }));
    expect(getStoredRefreshToken()).toBe("r");
  });

  it("returns null for a stored value that is not JSON", () => {
    window.localStorage.setItem("hakawi_tokens", "not-json");
    expect(getStoredRefreshToken()).toBeNull();
  });

  it("returns null for a stored object without a refresh token", () => {
    window.localStorage.setItem("hakawi_tokens", JSON.stringify({ accessToken: "a" }));
    expect(getStoredRefreshToken()).toBeNull();
  });

  it("returns null for a stored refresh token that is not a string", () => {
    window.localStorage.setItem("hakawi_tokens", JSON.stringify({ refreshToken: 7 }));
    expect(getStoredRefreshToken()).toBeNull();
  });
});

describe("request schema passthrough", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the inferred type of an inline schema", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const schema = z.object({ ok: z.boolean() });

    await expect(api.request(schema, "/health")).resolves.toEqual({ ok: true });
  });
});
