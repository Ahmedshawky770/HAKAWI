import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { FollowListEmpty, FollowListSkeleton, FollowListRow } from "@/components/social/FollowListRow";
import type { Follow } from "@/types/api";

const sampleFollow: Follow = {
  id: "follow-1",
  followerId: "follower-1",
  followingId: "following-1",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("FollowListRow", () => {
  it("renders the follower name and date", () => {
    render(<FollowListRow follow={sampleFollow} />);

    expect(screen.getByText("متابع تجريبي")).toBeDefined();
  });
});

describe("FollowListSkeleton", () => {
  it("renders the requested number of skeletons", () => {
    render(<FollowListSkeleton count={2} />);

    expect(screen.getByLabelText("جارٍ التحميل…")).toBeDefined();
  });
});

describe("FollowListEmpty", () => {
  it("renders the empty state", () => {
    render(<FollowListEmpty />);

    expect(screen.getByText("لا يوجد متابعون بعد.")).toBeDefined();
  });
});
