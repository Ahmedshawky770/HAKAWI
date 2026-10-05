/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi, beforeEach } from "vitest";

import { jsonResponse } from "@/test-utils/support";
import { api } from "@/lib/api";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const BASE = "http://localhost:3001/api/v1";

/**
 * WHY THIS FILE EXISTS.
 *
 * The Phase-3 client methods addressed routes the backend does not serve:
 * `/users/:id/follow`, `/stories/:id/reactions`, `/stories/:id/comments`. Every one of those
 * answered 404 in production, and `api.test.ts` asserted the SAME invented URLs — so the suite
 * reported the bug as the expected behaviour. A test written from the same assumption as the code
 * cannot catch the code being wrong about the outside world; it only proves the client is
 * self-consistent with itself.
 *
 * So this file makes a different kind of claim. Each block below names the backend controller and
 * the file that declares the route, and each test asserts the client hits that EXACT path with that
 * EXACT method. The claim is falsifiable by reading the BACKEND, not by reading the client — the
 * router is the source of truth and the client is the thing under test.
 *
 * HOW TO UPDATE IT. If a route legitimately moves, change the backend controller FIRST, then change
 * the string here and the call in `api.ts` in the same commit. Editing only `api.ts` fails here,
 * which is the intended outcome.
 *
 * The backend routes all sit under the `api/v1` global prefix set at `backend/src/main.ts:101`;
 * the paths asserted below are the paths as `api.ts` spells them, i.e. without that prefix.
 */

function lastCall(): { url: string; path: string; init: RequestInit | undefined } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const url = String(call?.[0]);
  return { url, path: url.slice(BASE.length), init: call?.[1] };
}

function lastBody(): Record<string, unknown> {
  const body = lastCall().init?.body;
  const parsed: unknown = typeof body === "string" ? JSON.parse(body) : body;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`expected a JSON object body, received ${String(body)}`);
  }
  return { ...parsed };
}

function stubFetch(): void {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
}

/**
 * Response bodies shaped exactly like the rows the backend returns, so a request that reaches the
 * wrong route and a request that reaches the right one cannot be told apart by status code alone —
 * only the URL under assertion distinguishes them.
 */

/** A `follows` row: `FollowsRepository.create` returns `db.insert(follows)...returning()`. */
const FOLLOW_ROW = {
  id: "follow-1",
  followerId: "user-1",
  followingId: "user-2",
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** A `reactions` row, the return value of `ReactionsService.addReaction`. */
const REACTION_ROW = {
  id: "reaction-1",
  userId: "user-1",
  storyId: "story-1",
  type: "love",
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** A comment as `CommentsService.toCommentResponse` renders it. */
const COMMENT_ROW = {
  id: "comment-1",
  storyId: "story-1",
  authorId: "user-1",
  authorName: "أحمد",
  parentId: null,
  content: "ممتاز",
  likeCount: 0,
  replyCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/**
 * `FollowsController` — `backend/src/modules/follows/controllers/follows.controller.ts`, mounted on
 * `@Controller('follows')`.
 *
 * `POST /follows` takes `FollowUserDto.followingId` in the BODY
 * (`backend/src/modules/follows/dto/follows.dto.ts:3-6`); the follower is the authenticated
 * principal, read from `req.user.sub`, and never appears in the request.
 */
describe("client contract: FollowsController (backend/src/modules/follows/controllers/follows.controller.ts)", () => {
  beforeEach(stubFetch);

  it("POSTs /follows with the followed user id in the body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FOLLOW_ROW));

    await api.followUser("user-2");

    expect(lastCall().path).toBe("/follows");
    expect(lastCall().init?.method).toBe("POST");
    expect(lastBody()).toEqual({ followingId: "user-2" });
  });

  it("never puts the followed user id in the path of a follow", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FOLLOW_ROW));

    await api.followUser("user-2");

    // `@Controller('follows')` declares no `POST /:followingId` route, so any `:id` segment here is
    // a 404 by construction. This is the assertion the old suite inverted.
    expect(lastCall().path).not.toContain("user-2");
  });

  it("DELETEs /follows/:followingId with no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Unfollowed successfully" }));

    await api.unfollowUser("user-2");

    expect(lastCall().path).toBe("/follows/user-2");
    expect(lastCall().init?.method).toBe("DELETE");
    expect(lastCall().init?.body).toBeUndefined();
  });

  it("GETs /follows/user/:userId/followers with its paging query", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ followers: [FOLLOW_ROW], total: 1, page: 2, limit: 5 }));

    await api.getFollowers("user-1", { page: 2, limit: 5 });

    expect(lastCall().path).toBe("/follows/user/user-1/followers?page=2&limit=5");
    expect(lastCall().init?.method).toBeUndefined();
  });

  it("GETs /follows/user/:userId/following and omits the query when nothing is paged", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ following: [FOLLOW_ROW], total: 1, page: 1, limit: 20 }));

    await api.getFollowing("user-1");

    expect(lastCall().path).toBe("/follows/user/user-1/following");
  });
});

/**
 * `ReactionsController` — `backend/src/modules/reactions/controllers/reactions.controller.ts`,
 * mounted on `@Controller('reactions')`. The plural collection is the ROOT and the story is a
 * parameter OF it, which is the opposite nesting order from what the client used to send.
 */
describe("client contract: ReactionsController (backend/src/modules/reactions/controllers/reactions.controller.ts)", () => {
  beforeEach(stubFetch);

  it("GETs /reactions/stories/:storyId", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ reactions: [REACTION_ROW], total: 1, page: 1, limit: 20 }));

    await api.getReactions("story-1", { page: 1, limit: 20 });

    expect(lastCall().path).toBe("/reactions/stories/story-1?page=1&limit=20");
  });

  it("GETs /reactions/stories/:storyId/counts with no query string", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ like: 0, love: 0, wow: 0, sad: 0, angry: 0, haunted: 0 }));

    await api.getReactionCounts("story-1");

    expect(lastCall().path).toBe("/reactions/stories/story-1/counts");
  });

  it("POSTs /reactions/stories/:storyId with the reaction type in the body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(REACTION_ROW, 201));

    await api.addReaction("story-1", "love");

    expect(lastCall().path).toBe("/reactions/stories/story-1");
    expect(lastCall().init?.method).toBe("POST");
    expect(lastBody()).toEqual({ type: "love" });
  });

  it("DELETEs /reactions/stories/:storyId with no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Reaction removed" }));

    await api.removeReaction("story-1");

    expect(lastCall().path).toBe("/reactions/stories/story-1");
    expect(lastCall().init?.method).toBe("DELETE");
    expect(lastCall().init?.body).toBeUndefined();
  });
});

/**
 * `CommentsController` — `backend/src/modules/comments/controllers/comments.controller.ts`, mounted
 * on `@Controller('comments')`. `POST` is on the bare collection and `PATCH`/`DELETE` are keyed by
 * comment id only, so NO comment write route carries a story id in its path.
 */
describe("client contract: CommentsController (backend/src/modules/comments/controllers/comments.controller.ts)", () => {
  beforeEach(stubFetch);

  it("GETs /comments/story/:storyId", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ comments: [COMMENT_ROW], total: 1, page: 1, limit: 20 }));

    await api.getComments("story-1", { page: 1, limit: 20 });

    expect(lastCall().path).toBe("/comments/story/story-1?page=1&limit=20");
  });

  it("POSTs /comments with the story id in the body, not in the path", async () => {
    fetchMock.mockResolvedValue(jsonResponse(COMMENT_ROW, 201));

    await api.createComment("story-1", { content: COMMENT_ROW.content });

    expect(lastCall().path).toBe("/comments");
    expect(lastCall().init?.method).toBe("POST");
    expect(lastBody()).toEqual({ storyId: "story-1", content: COMMENT_ROW.content });
  });

  it("carries a reply parent id alongside the story id in the create body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...COMMENT_ROW, parentId: "comment-0" }, 201));

    await api.createComment("story-1", { content: COMMENT_ROW.content, parentId: "comment-0" });

    expect(lastCall().path).toBe("/comments");
    expect(lastBody()).toEqual({ storyId: "story-1", content: COMMENT_ROW.content, parentId: "comment-0" });
  });

  it("PATCHes /comments/:id with only the content", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...COMMENT_ROW, content: "معدّل" }));

    await api.updateComment("story-1", "comment-1", { content: "معدّل" });

    expect(lastCall().path).toBe("/comments/comment-1");
    expect(lastCall().init?.method).toBe("PATCH");
    expect(lastBody()).toEqual({ content: "معدّل" });
  });

  it("DELETEs /comments/:id with no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Comment deleted" }));

    await api.deleteComment("story-1", "comment-1");

    expect(lastCall().path).toBe("/comments/comment-1");
    expect(lastCall().init?.method).toBe("DELETE");
    expect(lastCall().init?.body).toBeUndefined();
  });

  it("never addresses a comment write under /stories", async () => {
    fetchMock.mockResolvedValue(jsonResponse(COMMENT_ROW, 201));
    await api.createComment("story-1", { content: "أ" });
    fetchMock.mockResolvedValue(jsonResponse(COMMENT_ROW));
    await api.updateComment("story-1", "comment-1", { content: "ب" });
    fetchMock.mockResolvedValue(jsonResponse({ message: "Comment deleted" }));
    await api.deleteComment("story-1", "comment-1");

    const paths = fetchMock.mock.calls.map((call) => String(call[0]).slice(BASE.length));
    expect(paths).toEqual(["/comments", "/comments/comment-1", "/comments/comment-1"]);
  });
});

/**
 * `SearchController` — `backend/src/modules/search/search.controller.ts`, mounted on
 * `@Controller('search')`. `GET /search` binds `SearchFiltersDto`, whose text field is `query`
 * (`backend/src/modules/search/dto/search.dto.ts:12-15`), and `main.ts:147-156` sets
 * `forbidNonWhitelisted: true` on the global `ValidationPipe` — so an unknown `q` is a 400, not a
 * silently dropped parameter. The search page caught that error and rendered "no results" for every
 * query. `q` IS a real field, but on the sibling `SearchAuthorsQueryDto` that serves
 * `GET /search/authors`, which this client does not call.
 */
describe("client contract: SearchController (backend/src/modules/search/search.controller.ts)", () => {
  beforeEach(stubFetch);

  it("sends every filter under the name the search DTO declares", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, limit: 20, query: "harka", took: 3 }));

    await api.search({ query: "harka", category: "poetry", tag: "drama", page: 1, limit: 20 });

    expect(lastCall().path).toBe("/search?query=harka&category=poetry&tag=drama&page=1&limit=20");
    expect([...new URL(lastCall().url).searchParams.keys()]).not.toContain("q");
  });
});
