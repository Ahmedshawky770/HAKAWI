"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import type { Follow } from "@/types/api";

interface FollowListRowProps {
  follow: Follow;
}

export function FollowListRow({ follow }: FollowListRowProps) {
  const user = follow.follower ?? follow.following;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={user?.name ?? "مستخدم"} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {user?.name ?? "مستخدم"}
          </p>
          <p className="text-xs text-ink-muted">
            {new Date(follow.createdAt).toLocaleDateString("ar-EG")}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function FollowListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function FollowListEmpty() {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">لا يوجد متابعون بعد.</p>
    </Card>
  );
}
