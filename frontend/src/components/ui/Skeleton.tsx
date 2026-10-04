import React from "react";

/**
 * The loading placeholder of §7.
 *
 * Two rules make a skeleton feel like the thing it replaces:
 *
 * 1. **Same dimensions.** A skeleton that is a different height from the loaded
 *    card moves the content the reader was looking at, which reads as a glitch.
 *    The variants below therefore mirror the real paddings, cover ratio and
 *    footer height of the components they stand in for.
 * 2. **Never announce itself as content.** `aria-hidden` throughout, because the
 *    loading state is announced once by the `role="status"` region that owns it
 *    (see `Loading` and the feed). Announcing both would talk over itself.
 *
 * The shimmer is the amber→aqua gradient in `.hk-skeleton`; `animate-skeleton`
 * travels it, and both collapse under `prefers-reduced-motion`.
 */
export function Skeleton({ className = "", rounded = "rounded-md" }: { className?: string; rounded?: string }) {
  return <div aria-hidden="true" className={`hk-skeleton animate-skeleton ${rounded} ${className}`.trim()} />;
}

/** Placeholder for a compact list row (conversations, notifications, payments). */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
      <Skeleton className="size-12 shrink-0" rounded="rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
