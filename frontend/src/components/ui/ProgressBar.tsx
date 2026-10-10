import React from "react";

/**
 * A determinate progress bar.
 *
 * `role="progressbar"` with `aria-valuenow` is the whole accessibility story:
 * a filled bar that only conveys state visually is invisible to a screen
 * reader, and reading progress is the single most valuable number on the library
 * and rental screens.
 *
 * The bar itself is a `transform: scaleX()` animation rather than a width
 * change, because width triggers layout on every frame and this bar animates on
 * a page the reader is already scrolling.
 */
export function ProgressBar({
  value,
  label,
  className = "",
  tone = "accent",
}: {
  value: number;
  label: string;
  className?: string;
  tone?: "accent" | "chrome" | "success";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fills = {
    accent: "bg-accent-fill",
    chrome: "bg-chrome",
    success: "bg-success",
  } as const;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={`h-2 w-full overflow-hidden rounded-full bg-surface-raised ${className}`.trim()}
    >
      <div
        className={`h-full origin-start rounded-full transition-transform duration-500 ease-out ${fills[tone]}`}
        style={{ transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
}
