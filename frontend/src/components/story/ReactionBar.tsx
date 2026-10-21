"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { REACTION_TYPES, type ReactionCounts, type ReactionType } from "@hakawi/shared-types";
import { api } from "@/lib/api";
import { useStoredUser } from "@/lib/use-stored-user";
import { classifyError } from "@/lib/errors";
import { reactionKeys, storyKeys } from "@/lib/queries";
import { useToast } from "@/components/providers/ToastProvider";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Icon } from "@/components/ui/Icon";

import { ReactionGlyph } from "./ReactionGlyph";

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
  const strings = useStrings();
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

  /**
   * The reader's id, from the session store.
   *
   * The reader's own reaction is resolved from the reaction list by this id,
   * and the id is read through the store rather than out of local storage
   * during render: the server has no local storage to read, so the pressed
   * state would be resolved against two different readers. See
   * `lib/use-stored-user.ts`.
   */
  const currentUserId = useStoredUser()?.id ?? null;
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
      // The server's wording is classified and then said in the reader's
      // language — a toast that says "Unauthorized" in an Arabic interface is
      // not an explanation.
      notify(strings.errors[classifyError(error)], "error");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: countsKey });
      void queryClient.invalidateQueries({ queryKey: listKey });
      /*
       * THE STORY'S OWN COUNT MOVED TOO.
       *
       * The story's cache entry carries `story.reactions`, and the story page
       * shows it beside this bar. Invalidating only the reaction keys left
       * that number at its pre-reaction value — the bar and the number next to
       * it disagreed, and with the app-wide stale time the number stayed wrong
       * for the rest of the session.
       */
      void queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
    },
  });

  const counts = countsQuery.data;
  const total = counts ? totalOf(counts) : fallbackCount;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={strings.story.reactionsLabel}>
      {REACTION_TYPES.map((type) => (
        <ReactionButton
          key={type}
          type={type}
          label={strings.story.reactionNames[type]}
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
  label,
  count,
  total,
  active,
  onReact,
  onRemove,
}: {
  type: ReactionType;
  label: string;
  count: number;
  total: number;
  active: boolean;
  onReact: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label} (${total})`}
      onClick={() => (active ? onRemove() : onReact())}
      // 44px tall: this is a row of six small targets that a reader taps with a
      // thumb, and a 36px chip is a mis-tap waiting to happen.
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200 hover:shadow-[var(--hk-glow-accent)] ${
        active
          ? "animate-beat border-accent/40 bg-accent-soft text-accent-ink"
          : "border-line text-ink-muted hover:border-accent/30 hover:text-accent-ink"
      }`}
    >
      <ReactionGlyph type={type} />
      <span className="hk-numeric">{count}</span>
    </button>
  );
}

/**
 * The compact read-only counter for cards, where six buttons would be noise.
 * Amber, per §3: social reactions are never blue.
 */
export function ReactionCount({ count }: { count: number }) {
  const strings = useStrings();

  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
      <Icon name="heart" size="sm" className="text-accent-ink" />
      <span className="hk-numeric">{count}</span>
      <span className="sr-only">{strings.story.reactionCountLabel}</span>
    </span>
  );
}
