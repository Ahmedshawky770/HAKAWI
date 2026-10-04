import React from "react";

import { Icon, type IconName } from "./Icon";

/**
 * The empty state.
 *
 * Every list in this product can legitimately be empty — no library, no
 * messages, no search results — and a blank column reads as a broken page. The
 * empty state names what is missing and offers the one action that fills it, so
 * "nothing here" becomes "here is how to start".
 */
export function EmptyState({
  icon = "sparkle",
  title,
  description,
  action,
  className = "",
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/40 px-6 py-14 text-center ${className}`.trim()}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
        <Icon name={icon} size="lg" />
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
