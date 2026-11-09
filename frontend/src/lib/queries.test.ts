import { describe, expect, it } from "vitest";

import { flattenStories, isFailedLoad, nextPageFrom } from "@/lib/queries";
import type { StoriesListResponse } from "@/types/api";

describe("flattenStories", () => {
  it("returns an empty array for undefined data", () => {
    expect(flattenStories(undefined)).toEqual([]);
  });

  it("returns an empty array for data with no pages", () => {
    expect(flattenStories({ pages: [] })).toEqual([]);
  });

  it("flattens stories across pages", () => {
    const data = {
      pages: [
        { stories: [{ id: "s1", title: "أ" }], total: 2, page: 1, limit: 1 },
        { stories: [{ id: "s2", title: "ب" }], total: 2, page: 2, limit: 1 },
      ],
    } as unknown as { pages: StoriesListResponse[] };
    expect(flattenStories(data)).toEqual([
      { id: "s1", title: "أ" },
      { id: "s2", title: "ب" },
    ]);
  });

  it("de-duplicates stories by id across pages", () => {
    const story = { id: "s1", title: "أ" };
    const data = {
      pages: [
        { stories: [story], total: 1, page: 1, limit: 1 },
        { stories: [story], total: 1, page: 2, limit: 1 },
      ],
    } as unknown as { pages: StoriesListResponse[] };
    expect(flattenStories(data)).toEqual([story]);
  });
});

describe("nextPageFrom", () => {
  it("returns the next page when there are more items", () => {
    expect(nextPageFrom({ page: 1, limit: 20, total: 45 })).toBe(2);
  });

  it("returns undefined when all items are consumed", () => {
    expect(nextPageFrom({ page: 3, limit: 20, total: 60 })).toBeUndefined();
  });

  it("returns undefined when there are zero items", () => {
    expect(nextPageFrom({ page: 1, limit: 20, total: 0 })).toBeUndefined();
  });
});

describe("isFailedLoad", () => {
  it("returns true when there is an error and no data", () => {
    expect(isFailedLoad({ isError: true, data: undefined })).toBe(true);
  });

  it("returns false when there is an error but data still exists", () => {
    expect(isFailedLoad({ isError: true, data: [{ id: "1" }] as unknown })).toBe(false);
  });

  it("returns false when there is no error", () => {
    expect(isFailedLoad({ isError: false, data: undefined })).toBe(false);
    expect(isFailedLoad({ isError: false, data: [{ id: "1" }] as unknown })).toBe(false);
  });
});
