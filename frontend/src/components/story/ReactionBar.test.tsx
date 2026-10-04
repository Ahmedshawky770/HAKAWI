/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { REACTION_TYPES } from "@hakawi/shared-types";
import { ReactionBar, reactionKeys } from "@/components/story/ReactionBar";
import { createTestQueryClient, renderWithProviders } from "@/test-utils/render";

const STORY_ID = "story-1";

/**
 * The mock factory is hoisted, so it may not close over the spies it returns.
 * `vi.hoisted` creates them first and both sides then share one reference.
 */
const { addReaction, removeReaction, getReactionCounts, getReactions } = vi.hoisted(() => ({
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  getReactionCounts: vi.fn(async () => ({ like: 5 })),
  getReactions: vi.fn(async () => ({ reactions: [] as unknown[], total: 0, page: 1, limit: 50 })),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, addReaction, removeReaction, getReactionCounts, getReactions },
  };
});

beforeEach(() => {
  addReaction.mockReset();
  removeReaction.mockReset();
  getReactionCounts.mockReset().mockResolvedValue({ like: 5 });
  getReactions.mockReset().mockResolvedValue({ reactions: [], total: 0, page: 1, limit: 50 });
  addReaction.mockResolvedValue({ reaction: { id: "r1" } });
  removeReaction.mockResolvedValue({ message: "Removed" });
  window.localStorage.setItem("hakawi_user", JSON.stringify({ id: "user-9", email: "a@b.c", name: "أحمد" }));
});

describe("ReactionBar", () => {
  it("offers every reaction the API accepts, and no others", async () => {
    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={5} />);

    await screen.findByRole("group", { name: "التفاعلات" });

    // The list comes from @hakawi/shared-types, so a reaction the server would
    // reject with a 400 cannot be added by accident here.
    expect(REACTION_TYPES).toEqual(["like", "love", "wow", "sad", "angry", "haunted"]);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(REACTION_TYPES.length);
    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button.getAttribute("aria-label")).toMatch(/\(\d+\)$/);
    }
  });

  it("names each reaction and carries the total in its label", async () => {
    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={7} />);

    const like = await screen.findByRole("button", { name: /أعجبني/ });
    expect(like).toHaveAttribute("aria-label", "أعجبني (7)");
  });

  it("sends the reaction the reader pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={0} />);

    await user.click(await screen.findByRole("button", { name: /رعبتني/ }));

    await waitFor(() => expect(addReaction).toHaveBeenCalledWith(STORY_ID, "haunted"));
  });

  it("writes the prediction into the cache before the server answers", async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(reactionKeys.counts(STORY_ID), { like: 5, love: 2 });
    addReaction.mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={7} />, { queryClient });
    const like = await screen.findByRole("button", { name: /أعجبني/ });
    expect(like).toHaveTextContent("5");

    await user.click(like);

    // One reaction per story: every type is zeroed and the pressed one is one.
    await waitFor(() =>
      expect(queryClient.getQueryData(reactionKeys.counts(STORY_ID))).toEqual({
        like: 1,
        love: 0,
        wow: 0,
        sad: 0,
        angry: 0,
        haunted: 0,
      }),
    );
    expect(await screen.findByRole("button", { name: /أعجبني/ })).toHaveTextContent("1");
  });

  it("restores the snapshot and says why when the request fails", async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(reactionKeys.counts(STORY_ID), { like: 5 });
    addReaction.mockRejectedValue(new Error("Unauthorized"));

    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={5} />, { queryClient });

    await user.click(await screen.findByRole("button", { name: /أعجبني/ }));

    // A silent revert reads as a bug; the toast is what makes it legible.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unauthorized");
    await waitFor(() => expect(queryClient.getQueryData(reactionKeys.counts(STORY_ID))).toEqual({ like: 5 }));
  });

  it("marks the reader's own reaction as pressed, resolved from the reaction list", async () => {
    getReactions.mockResolvedValueOnce({
      reactions: [{ id: "r1", userId: "user-9", storyId: STORY_ID, type: "wow", createdAt: "2026-01-01" }],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={1} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /أدهشتني/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("removes the reaction instead of adding it a second time", async () => {
    const user = userEvent.setup();
    getReactions.mockResolvedValueOnce({
      reactions: [{ id: "r1", userId: "user-9", storyId: STORY_ID, type: "wow", createdAt: "2026-01-01" }],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderWithProviders(<ReactionBar storyId={STORY_ID} fallbackCount={1} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /أدهشتني/ })).toHaveAttribute("aria-pressed", "true"));

    await user.click(screen.getByRole("button", { name: /أدهشتني/ }));

    await waitFor(() => expect(removeReaction).toHaveBeenCalledWith(STORY_ID));
    expect(addReaction).not.toHaveBeenCalled();
  });
});