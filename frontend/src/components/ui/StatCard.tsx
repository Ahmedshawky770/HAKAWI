import React from "react";

import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";

/**
 * A dashboard metric.
 *
 * The number is set in `hk-numeric`: tabular figures, isolated from the
 * surrounding RTL sentence, so a count never reorders next to its label and a
 * column of totals lines up on the digit instead of the comma.
 */
export function StatCard({
  label,
  value,
  icon,
  hint,
  className = "",
}: {
  label: string;
  value: string | number;
  icon: IconName;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
          <Icon name={icon} size="sm" />
        </span>
      </div>
      <p className="hk-numeric mt-2 text-3xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}
