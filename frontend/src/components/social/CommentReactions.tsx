"use client";

import React, { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { REACTION_TYPES, type ReactionCounts, type ReactionType } from "@hakawi/shared-types";
import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { useStoredUser } from "@/lib/use-stored-user";
import { useToast } from "@/components/providers/ToastProvider";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Icon } from "@/components/ui/Icon";

import { ReactionGlyph } from "@/components/story/ReactionGlyph";

type ReactionCountTotals = Partial<ReactionCounts>;

function zeroCounts(): ReactionCountTotals {
  return Object.fromEntries(REACTION_TYPES.map((type) => [type, 0])) as ReactionCountTotals;
}

function countsFrom(reactions: { type: ReactionType }[]): ReactionCountTotals {
  const totals = zeroCounts();
  for (const reaction of reactions) {
    totals[reaction.type] = (totals[reaction.type] ?? 0) + 1;
  }
  return totals;
}

interface CommentReactionsProps {
  commentId: string;
  className?: string;
}

export function CommentReactions({ commentId, className = "" }: CommentReactionsProps) {
  const strings = useStrings();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const currentUserId = useStoredUser()?.id ?? null;

  const key = ["comments", "reactions", commentId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getCommentReactions(commentId, { page: 1, limit: 50 }),
    staleTime: 1000 * 60,
    enabled: commentId.length > 0,
  });

  const totals = useMemo(() => countsFrom(query.data?.reactions ?? []), [
    query.data?.reactions,
  ]);
  const total = useMemo(
    () => REACTION_TYPES.reduce((sum, type) => sum + (totals[type] ?? 0), 0),
    [totals],
  );

  const myReaction = query.data?.reactions.find((reaction) => reaction.userId === currentUserId)?.type ?? null;

  const mutation = useMutation({
    mutationFn: async (next: ReactionType | null) => {
      if (next === null) {
        await api.removeCommentReaction(commentId);
        return;
      }
      await api.addCommentReaction(commentId, next);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      notify(strings.errors[classifyError(error)], "error");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}
      role="group"
      aria-label={strings.social.commentReactionLabel}
    >
      {REACTION_TYPES.map((type) => {
        const active = myReaction === type;
        const label = strings.story.reactionNames[type];
        const count = totals[type] ?? 0;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={active}
            aria-label={`${label} (${count})`}
            onClick={() => (active ? mutation.mutate(null) : mutation.mutate(type))}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-all duration-200 hover:shadow-[var(--hk-glow-accent)] ${
              active
                ? "animate-beat border-accent/40 bg-accent-soft text-accent-ink"
                : "border-line text-ink-muted hover:border-accent/30 hover:text-accent-ink"
            }`}
          >
            <ReactionGlyph type={type} size={14} />
            <span className="hk-numeric">{count}</span>
          </button>
        );
      })}
      {total > 0 && (
        <span className="text-xs text-ink-muted">
          <Icon name="heart" size="sm" className="text-accent-ink" />
          <span className="hk-numeric">{total}</span>
        </span>
      )}
    </div>
  );
}
