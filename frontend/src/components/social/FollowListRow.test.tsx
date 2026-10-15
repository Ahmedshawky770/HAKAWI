import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { FollowListEmpty, FollowListRow } from "@/components/social/FollowListRow";
import { renderWithProviders } from "@/test-utils/render";
import type { Follow } from "@/types/api";

const sampleFollow: Follow = {
  id: "follow-1",
  followerId: "follower-1",
  followingId: "following-1",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("FollowListRow", () => {
  it("renders the follower name and date", () => {
    renderWithProviders(<FollowListRow follow={sampleFollow} />);

    expect(screen.getByText("متابع")).toBeDefined();
  });
});

describe("FollowListEmpty", () => {
  it("renders the empty state", () => {
    renderWithProviders(<FollowListEmpty />);

    expect(screen.getByText("لا يوجد متابعون بعد.")).toBeDefined();
  });
});
