"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { REACTION_TYPES, type ReactionCounts, type ReactionType } from "@hakawi/shared-types";
import { api, getStoredUser } from "@/lib/api";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";

/**
 * How each reaction presents: the glyph beside the number and the name a screen
 * reader reads out.
 *
 * The list of reactions is NOT written here. `REACTION_TYPES` comes from
 * `@hakawi/shared-types`, which is the same list the API validates against — a
 * local copy of those six strings would be a second source of truth for a
 * contract, and would eventually offer a reaction the server rejects with a 400.
 * A missing presentation is a type error at build time, not a blank button.
 */
const PRESENTATION: Record<ReactionType, { label: string; glyph: string }> = {
  like: { label: "أعجبني", glyph: "❤" },
  love: { label: "أحببتها", glyph: "💛" },
  wow: { label: "أدهشتني", glyph: "✨" },
  sad: { label: "أبكّتني", glyph: "💧" },
  angry: { label: "غضبتها", glyph: "🔥" },
  haunted: { label: "رعبتني", glyph: "👻" },
};

export const reactionKeys = {
  counts: (storyId: string) => ["reactions", storyId, "counts"] as const,
  list: (storyId: string) => ["reactions", storyId, "list"] as const,
};

/**
 * What the counts endpoint actually returns.
 *
 * `reactionCountsSchema` types every reaction as OPTIONAL, because the backend
 * only serialises the reactions that have been used: a story nobody has
 * "haunted" has no `haunted` key at all. Reading it as `ReactionCounts` (all six
 * required) would be a lie the type checker rightly refuses, so the row reads
 * each type through `?? 0` and every count it renders is a real number.
 */
type ReactionCountTotals = Partial<ReactionCounts>;

function zeroCounts(): ReactionCountTotals {
  return Object.fromEntries(REACTION_TYPES.map((type) => [type, 0])) as ReactionCountTotals;
}

function totalOf(counts: ReactionCountTotals): number {
  return REACTION_TYPES.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
}

/**
 * The reaction row of §6, and the optimistic pattern of §7 in full:
 *
 * ```
 *   click ─▶ mutation starts, onMutate writes the predicted state into the cache
 *           ├─ the count moves on the next frame, the glyph fills, `animate-beat`
 *           └─ failure: the snapshot is restored AND a toast says why
 *   ```
 *
 * Three decisions that separate "instant" from "broken":
 *
 * - **The optimistic state is written into the query cache, not into a local
 *   counter.** Every surface showing this story's reactions therefore moves
 *   together, and the settled value is the server's rather than arithmetic that
 *   can drift after a rollback.
 * - **A failed click explains itself.** Undoing a tap silently is
 *   indistinguishable from a bug; a toast saying why is not.
 * - **The reader's own reaction is resolved from the reaction list**, filtered by
 *   the stored id, because the API exposes no "my reaction" route. It is one
 *   small request on a detail page, and it is what makes the pressed state
 *   correct on reload rather than optimistically wrong.
 */
export function ReactionBar({ storyId, fallbackCount }: { storyId: string; fallbackCount: number }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const countsKey = reactionKeys.counts(storyId);
  const listKey = reactionKeys.list(storyId);

  const countsQuery = useQuery({
    queryKey: countsKey,
    queryFn: () => api.getReactionCounts(storyId),
    staleTime: 1000 * 60,
  });

  const mineQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.getReactions(storyId, { page: 1, limit: 50 }),
    staleTime: 1000 * 60,
  });

  const currentUserId = getStoredUser()?.id ?? null;
  const myReaction = mineQuery.data?.reactions.find((reaction) => reaction.userId === currentUserId)?.type ?? null;

  const mutation = useMutation({
    mutationFn: async (next: ReactionType | null) => {
      if (next === null) {
        await api.removeReaction(storyId);
        return;
      }
      await api.addReaction(storyId, next);
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: countsKey });
      const previousCounts = queryClient.getQueryData<ReactionCountTotals>(countsKey);
      const previousList = queryClient.getQueryData(listKey);

      if (previousCounts) {
        // The reader has exactly one reaction per story, so predicting the state
        // means zeroing every type and setting the one being applied.
        const predicted = zeroCounts();
        if (next) predicted[next] = 1;
        queryClient.setQueryData(countsKey, predicted);
      }

      return { previousCounts, previousList, next };
    },
    onError: (error, _next, context) => {
      if (context?.previousCounts) queryClient.setQueryData(countsKey, context.previousCounts);
      if (context?.previousList) queryClient.setQueryData(listKey, context.previousList);
      notify(error instanceof Error ? error.message : "تعذّر تسجيل التفاعل", "error");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: countsKey });
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const counts = countsQuery.data;
  const total = counts ? totalOf(counts) : fallbackCount;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="التفاعلات">
{REACTION_TYPES.map((type) => (
        <ReactionButton
          key={type}
          type={type}
          count={counts ? (counts[type] ?? 0) : 0}
          total={total}
          active={myReaction === type}
          onReact={() => mutation.mutate(type)}
          onRemove={() => mutation.mutate(null)}
        />
      ))}
    </div>
  );
}

function ReactionButton({
  type,
  count,
  total,
  active,
  onReact,
  onRemove,
}: {
  type: ReactionType;
  count: number;
  total: number;
  active: boolean;
  onReact: () => void;
  onRemove: () => void;
}) {
  const presentation = PRESENTATION[type];

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${presentation.label} (${total})`}
      onClick={() => (active ? onRemove() : onReact())}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200 hover:shadow-[var(--hk-glow-accent)] ${
        active
          ? "animate-beat border-accent/40 bg-accent-soft text-accent-ink"
          : "border-line text-ink-muted hover:border-accent/30 hover:text-accent-ink"
      }`}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      <span className="hk-numeric">{count}</span>
    </button>
  );
}

/**
 * The compact read-only counter for cards, where six buttons would be noise.
 * Amber, per §3: social reactions are never blue.
 */
export function ReactionCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
      <Icon name="heart" size="sm" className="text-accent-ink" />
      <span className="hk-numeric">{count}</span>
      <span className="sr-only">تفاعل</span>
    </span>
  );
}
