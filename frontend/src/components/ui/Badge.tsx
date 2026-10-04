import React from "react";

export type BadgeTone = "neutral" | "accent" | "chrome" | "success" | "warning" | "error" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-surface-raised text-ink-muted",
  accent: "border-accent/30 bg-accent-soft text-accent-ink",
  chrome: "border-chrome/30 bg-chrome-soft text-chrome-ink",
  success: "border-success/30 bg-success-soft text-success-ink",
  warning: "border-warning/30 bg-warning-soft text-warning-ink",
  error: "border-error/30 bg-error-soft text-error-ink",
  info: "border-info/30 bg-info-soft text-info-ink",
};

/**
 * The status pill.
 *
 * Every status in the product — owned, rented, active, overdue, draft — is a
 * badge, and each maps to a semantic tone. Before this component the mapping
 * was a table of Tailwind colour pairs repeated in three pages, which meant a
 * "rented" pill was blue on one page and grey on another. The mapping now lives
 * once, here, and the state vocabulary lives beside it.
 */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/**
 * The status vocabulary of the library, rentals and payments domains, expressed
 * as tones. Presentation only — the API decides the state, this decides the
 * colour (Principle #9: one place per fact).
 */
export const LIBRARY_STATUS_TONES: Record<string, BadgeTone> = {
  owned: "success",
  rented: "chrome",
  reading: "warning",
  completed: "neutral",
};

export const RENTAL_STATUS_TONES: Record<string, BadgeTone> = {
  active: "success",
  returned: "neutral",
  expired: "error",
  overdue: "error",
};

export const PAYMENT_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  completed: "success",
  failed: "error",
  refunded: "info",
};

export const CONTEST_STATUS_TONES: Record<string, BadgeTone> = {
  upcoming: "info",
  open: "success",
  closed: "neutral",
  judging: "warning",
  completed: "chrome",
  cancelled: "error",
};

export function toneFor(map: Record<string, BadgeTone>, status: string): BadgeTone {
  return map[status] ?? "neutral";
}
