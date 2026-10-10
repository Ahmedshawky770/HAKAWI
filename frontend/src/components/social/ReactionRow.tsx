"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import type { Reaction } from "@/types/api";

interface ReactionRowProps {
  reaction: Reaction;
}

const REACTION_PRESENTATION: Record<string, { label: string; glyph: string }> = {
  like: { label: "أعجبني", glyph: "❤" },
  love: { label: "أحببتها", glyph: "💛" },
  wow: { label: "أدهشتني", glyph: "✨" },
  sad: { label: "أبكّتني", glyph: "💧" },
  angry: { label: "غضبتها", glyph: "🔥" },
  haunted: { label: "رعبتني", glyph: "👻" },
};

export function ReactionRow({ reaction }: ReactionRowProps) {
  const presentation = REACTION_PRESENTATION[reaction.type] ?? { label: reaction.type, glyph: "💬" };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name="مستخدم" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            مستخدم
          </p>
          <p className="text-xs text-ink-muted">
            {new Date(reaction.createdAt).toLocaleDateString("ar-EG")}
          </p>
        </div>
        <Badge tone="neutral" className="shrink-0">
          <span aria-hidden>{presentation.glyph}</span>
          <span className="sr-only">{presentation.label}</span>
        </Badge>
      </div>
    </Card>
  );
}

export function ReactionListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function ReactionListEmpty() {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">لا توجد تفاعلات بعد. كن أول من يتفاعل!</p>
    </Card>
  );
}
