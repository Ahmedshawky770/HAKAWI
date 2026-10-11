"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { Follow } from "@/types/api";

interface FollowListRowProps {
  follow: Follow;
}

export function FollowListRow({ follow }: FollowListRowProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name="مستخدم" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            متابع
          </p>
          <p className="text-xs text-ink-muted">
            {new Date(follow.createdAt).toLocaleDateString("ar-EG")}
          </p>
        </div>
      </div>
    </Card>
  );
}

interface FollowListEmptyProps {
  label?: string;
}

export function FollowListEmpty({ label = "لا يوجد متابعون بعد." }: FollowListEmptyProps = {}) {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">{label}</p>
    </Card>
  );
}
