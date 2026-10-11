import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { ReactionListEmpty, ReactionRow } from "@/components/social/ReactionRow";
import type { Reaction } from "@/types/api";

const sampleReaction: Reaction = {
  id: "reaction-1",
  storyId: "story-1",
  userId: "user-1",
  type: "like",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("ReactionRow", () => {
  it("renders the reaction author and type label", () => {
    render(<ReactionRow reaction={sampleReaction} />);

    expect(screen.getByText("مستخدم")).toBeDefined();
  });
});

describe("ReactionListEmpty", () => {
  it("renders the empty state", () => {
    render(<ReactionListEmpty />);

    expect(screen.getByText("لا توجد تفاعلات بعد. كن أول من يتفاعل!")).toBeDefined();
  });
});
