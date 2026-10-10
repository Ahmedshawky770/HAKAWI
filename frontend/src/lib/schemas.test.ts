/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect } from "vitest";

import { AUTH_RESPONSE, BOOK, BOOK_RECORD, NOTIFICATION, PAYMENT, STORY, STORY_RECORD } from "@/test-utils/fixtures";
import {
  authResponseSchema,
  bookResponseSchema,
  commentSchema,
  countResultSchema,
  emptyResponseSchema,
  libraryItemSchema,
  messageOnlySchema,
  notificationSchema,
  paymentSchema,
  publicUserProfileSchema,
  reactionSchema,
  reportSchema,
  searchResponseSchema,
  sessionResponseSchema,
  storiesListResponseSchema,
  storyRecordResponseSchema,
  storyResponseSchema,
} from "@/lib/schemas";

describe("auth schemas", () => {
  it("accepts a complete auth response", () => {
    expect(authResponseSchema.parse(AUTH_RESPONSE)).toEqual(AUTH_RESPONSE);
  });

  it("rejects an auth response without a refresh token", () => {
    const { refreshToken, ...tokens } = AUTH_RESPONSE.tokens;
    expect(refreshToken).toBeTruthy();
    expect(authResponseSchema.safeParse({ user: AUTH_RESPONSE.user, tokens }).success).toBe(false);
  });

  it("rejects an auth user with an unknown account type", () => {
    const result = authResponseSchema.safeParse({
      ...AUTH_RESPONSE,
      user: { ...AUTH_RESPONSE.user, accountType: "superuser" },
    });
    expect(result.success).toBe(false);
  });

  it("requires the expiry of a session response", () => {
    const { expiresAt, ...withoutExpiry } = sessionResponseSchema.parse({
      user: AUTH_RESPONSE.user,
      expiresAt: "2026-01-01T00:15:00.000Z",
    });
    expect(expiresAt).toBe("2026-01-01T00:15:00.000Z");
    expect(sessionResponseSchema.safeParse({ user: withoutExpiry }).success).toBe(false);
  });

  it("requires every field of a public profile", () => {
    const profile = {
      id: "user-1",
      username: "ahmed",
      name: "أحمد",
      avatar: null,
      bio: null,
      accountType: "writer",
      isVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(publicUserProfileSchema.parse(profile)).toEqual(profile);
    expect(publicUserProfileSchema.safeParse({ ...profile, isVerified: "yes" }).success).toBe(false);
  });
});

describe("story schemas", () => {
  it("accepts a wire shaped story", () => {
    expect(storyResponseSchema.parse(STORY)).toEqual(STORY);
  });

  it("normalizes a record shaped story into the wire shape", () => {
    const story = storyResponseSchema.parse(STORY_RECORD);
    expect(story.views).toBe(STORY_RECORD.viewCount);
    expect(story.reactions).toBe(STORY_RECORD.likeCount);
    expect(story.category).toBe(STORY_RECORD.categoryId);
    expect(story.author.id).toBe(STORY_RECORD.authorId);
  });

  it("does not carry a comment counter into the wire shape", () => {
    const story = storyResponseSchema.parse(STORY_RECORD);
    expect(story).not.toHaveProperty("commentCount");
  });

  it("defaults the tags of a normalized record to an empty list", () => {
    expect(storyResponseSchema.parse(STORY_RECORD).tags).toEqual([]);
  });

  it("keeps a null category null through normalization", () => {
    expect(storyResponseSchema.parse({ ...STORY_RECORD, categoryId: null }).category).toBeNull();
  });

  it("rejects a story whose view counter is a string", () => {
    expect(storyResponseSchema.safeParse({ ...STORY, views: "12" }).success).toBe(false);
  });

  it("rejects a story whose tags are not a list", () => {
    expect(storyResponseSchema.safeParse({ ...STORY, tags: "drama" }).success).toBe(false);
  });

  it("rejects a story record that misses its counters", () => {
    const { viewCount, likeCount, ...withoutCounters } = STORY_RECORD;
    expect(viewCount).toBe(1500);
    expect(likeCount).toBe(42);
    expect(storyResponseSchema.safeParse(withoutCounters).success).toBe(false);
  });

  it("normalizes every entry of a list response", () => {
    const result = storiesListResponseSchema.parse({
      stories: [STORY_RECORD, STORY],
      total: 2,
      page: 1,
      limit: 20,
    });
    expect(result.stories[0]?.views).toBe(1500);
    expect(result.stories[1]).toEqual(STORY);
  });

  it("rejects a list response whose total is missing", () => {
    const result = storiesListResponseSchema.safeParse({ stories: [], page: 1, limit: 20 });
    expect(result.success).toBe(false);
  });
});

describe("story author name handling", () => {
  it("carries a null author name through as unknown", () => {
    const story = storyResponseSchema.parse({ ...STORY, author: { id: "user-1", name: null } });
    expect(story.author.id).toBe("user-1");
    expect(story.author.name).toBeNull();
  });

  it("carries a missing author name through as unknown", () => {
    const story = storyResponseSchema.parse({ ...STORY, author: { id: "user-1" } });
    expect(story.author.id).toBe("user-1");
    expect(story.author.name).toBeNull();
  });

  it("treats a blank author name as unknown", () => {
    const story = storyResponseSchema.parse({ ...STORY, author: { id: "user-1", name: "  " } });
    expect(story.author.name).toBeNull();
  });

  it("trims a padded author name instead of keeping the padding", () => {
    const story = storyResponseSchema.parse({ ...STORY, author: { id: "user-1", name: "  أحمد  " } });
    expect(story.author.name).toBe("أحمد");
  });

  it("still rejects a story whose author has no id", () => {
    expect(storyResponseSchema.safeParse({ ...STORY, author: { name: "أحمد" } }).success).toBe(false);
  });

  it("uses the author name that a record carries", () => {
    const story = storyResponseSchema.parse({ ...STORY_RECORD, authorName: "أحمد محمد" });
    expect(story.author).toEqual({ id: STORY_RECORD.authorId, name: "أحمد محمد" });
  });

  it("reports a null author name for a record that carries none", () => {
    const story = storyResponseSchema.parse(STORY_RECORD);
    expect(story.author).toEqual({ id: STORY_RECORD.authorId, name: null });
  });

  it("treats a blank author name on a record as unknown", () => {
    const story = storyResponseSchema.parse({ ...STORY_RECORD, authorName: "   " });
    expect(story.author.name).toBeNull();
  });

  it("rejects a record that omits the author name entirely", () => {
    const { authorName, ...withoutAuthorName } = STORY_RECORD;
    expect(authorName).toBeNull();
    expect(storyRecordResponseSchema.safeParse(withoutAuthorName).success).toBe(false);
  });

  it("exposes the author name on the raw record schema", () => {
    expect(storyRecordResponseSchema.parse({ ...STORY_RECORD, authorName: "أحمد" }).authorName).toBe("أحمد");
    expect(storyRecordResponseSchema.parse(STORY_RECORD).authorId).toBe(STORY_RECORD.authorId);
  });
});

describe("book schemas", () => {
  it("accepts a wire shaped book", () => {
    expect(bookResponseSchema.parse(BOOK)).toEqual(BOOK);
  });

  it("normalizes a record shaped book into the wire shape", () => {
    const book = bookResponseSchema.parse(BOOK_RECORD);
    expect(book.views).toBe(BOOK_RECORD.viewCount);
    expect(book.likes).toBe(BOOK_RECORD.likeCount);
    expect(book.downloads).toBe(BOOK_RECORD.downloadCount);
  });

  it("rejects a book whose price is a string", () => {
    expect(bookResponseSchema.safeParse({ ...BOOK, price: "25" }).success).toBe(false);
  });

  it("rejects a book whose free flag is missing", () => {
    const { isFree, ...withoutFlag } = BOOK;
    expect(isFree).toBe(false);
    expect(bookResponseSchema.safeParse(withoutFlag).success).toBe(false);
  });
});

describe("social schemas", () => {
  it("accepts a notification", () => {
    expect(notificationSchema.parse(NOTIFICATION)).toEqual(NOTIFICATION);
  });

  it("rejects a notification whose read flag is a string", () => {
    expect(notificationSchema.safeParse({ ...NOTIFICATION, isRead: "true" }).success).toBe(false);
  });

  it("rejects a notification whose data is not a record", () => {
    expect(notificationSchema.safeParse({ ...NOTIFICATION, data: "story-1" }).success).toBe(false);
  });

  it("accepts a comment with a null parent", () => {
    const comment = {
      id: "comment-1",
      storyId: "story-1",
      authorId: "user-1",
      authorName: "أحمد",
      parentId: null,
      content: "تعليق",
      likeCount: 0,
      replyCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(commentSchema.parse(comment)).toEqual(comment);
  });

  it("rejects a comment whose counters are strings", () => {
    const comment = {
      id: "comment-1",
      storyId: "story-1",
      authorId: "user-1",
      authorName: "أحمد",
      parentId: null,
      content: "تعليق",
      likeCount: "0",
      replyCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(commentSchema.safeParse(comment).success).toBe(false);
  });

  it("accepts a known reaction type", () => {
    const reaction = {
      id: "reaction-1",
      userId: "user-1",
      storyId: "story-1",
      type: "love",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(reactionSchema.parse(reaction)).toEqual(reaction);
  });

  it("rejects an unknown reaction type", () => {
    const reaction = {
      id: "reaction-1",
      userId: "user-1",
      storyId: "story-1",
      type: "clap",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(reactionSchema.safeParse(reaction).success).toBe(false);
  });
});

describe("commerce schemas", () => {
  it("accepts a payment", () => {
    expect(paymentSchema.parse(PAYMENT)).toEqual(PAYMENT);
  });

  it("rejects a payment whose amount is a string", () => {
    expect(paymentSchema.safeParse({ ...PAYMENT, amount: "100" }).success).toBe(false);
  });

  it("rejects a payment whose status is a number", () => {
    expect(paymentSchema.safeParse({ ...PAYMENT, status: 1 }).success).toBe(false);
  });

  it("accepts a library item with a known status", () => {
    const item = {
      id: "item-1",
      userId: "user-1",
      bookId: "book-1",
      rentalId: null,
      status: "owned",
      addedAt: "2026-01-01T00:00:00.000Z",
      lastAccessedAt: null,
    };
    expect(libraryItemSchema.parse(item)).toEqual(item);
  });

  it("rejects a library item with an unknown status", () => {
    const item = {
      id: "item-1",
      userId: "user-1",
      bookId: "book-1",
      rentalId: null,
      status: "borrowed",
      addedAt: "2026-01-01T00:00:00.000Z",
      lastAccessedAt: null,
    };
    expect(libraryItemSchema.safeParse(item).success).toBe(false);
  });
});

describe("moderation and search schemas", () => {
  it("rejects a report with an unknown target type", () => {
    const report = {
      id: "report-1",
      reporterId: "user-1",
      targetId: "story-1",
      targetType: "website",
      reason: "spam",
      description: null,
      status: "open",
      escalatedAt: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(reportSchema.safeParse(report).success).toBe(false);
  });

  it("accepts a search response with optional highlights", () => {
    const response = {
      results: [
        {
          id: "story-1",
          title: "ليلة في الحارة",
          slug: "layla",
          excerpt: "مقتطف",
          status: "published",
          category: "fiction",
          tags: [],
          author: { id: "user-1", name: "أحمد" },
          views: 1,
          reactions: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
          highlightedTitle: "ليلة في الحارة",
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      query: "layla",
      took: 4,
    };
    expect(searchResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects a search response without its query echo", () => {
    const result = searchResponseSchema.safeParse({
      results: [],
      total: 0,
      page: 1,
      limit: 20,
      took: 4,
    });
    expect(result.success).toBe(false);
  });
});

describe("simple response schemas", () => {
  it("accepts a count result", () => {
    expect(countResultSchema.parse({ count: 0 })).toEqual({ count: 0 });
  });

  it("rejects a count result whose count is a string", () => {
    expect(countResultSchema.safeParse({ count: "0" }).success).toBe(false);
  });

  it("accepts a message only response", () => {
    expect(messageOnlySchema.parse({ message: "done" })).toEqual({ message: "done" });
  });

  it("rejects a message only response without a message", () => {
    expect(messageOnlySchema.safeParse({}).success).toBe(false);
  });

  it("accepts only undefined for the empty response", () => {
    expect(emptyResponseSchema.safeParse(undefined).success).toBe(true);
    expect(emptyResponseSchema.safeParse({}).success).toBe(false);
  });
});
