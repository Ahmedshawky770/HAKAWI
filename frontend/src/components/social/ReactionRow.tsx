"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ReactionGlyph } from "@/components/story/ReactionGlyph";
import { formatDate } from "@/lib/i18n";
import type { Reaction } from "@/types/api";

interface ReactionRowProps {
  reaction: Reaction;
}

/**
 * One reaction, as a row.
 *
 * THE GLYPH IS THE PRODUCT'S OWN ART, AND THERE IS ONE TABLE FOR IT. The row
 * used to carry its own emoji table — `❤ 💛 ✨ 💧 🔥 👻` — beside the reaction
 * bar's table of the product's own drawings, so the same reaction was drawn
 * two different ways in two places of the same screen, and which one the reader
 * saw depended on where they looked. The art now comes from `ReactionGlyph`,
 * the one component that owns it, and the name of the reaction is read from the
 * story dictionary — the same table the bar and the reaction page read.
 */
export function ReactionRow({ reaction }: ReactionRowProps) {
  const { intl, strings } = useLocale();
  const label = strings.story.reactionNames[reaction.type] ?? reaction.type;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={strings.social.authorFallback} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{strings.social.authorFallback}</p>
          <p className="text-xs text-ink-muted">{formatDate(reaction.createdAt, intl)}</p>
        </div>
        <Badge tone="neutral" className="shrink-0">
          <ReactionGlyph type={reaction.type} size={20} />
          <span className="sr-only">{label}</span>
        </Badge>
      </div>
    </Card>
  );
}

export function ReactionListEmpty() {
  const { strings } = useLocale();

  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">{strings.social.reactionListEmpty}</p>
    </Card>
  );
}
