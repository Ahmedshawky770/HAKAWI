import React from "react";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  /** Fill the viewport. Used by the auth guard, which owns the whole screen. */
  fullScreen?: boolean;
  className?: string;
}

const SIZES = {
  sm: "size-4",
  md: "size-8",
  lg: "size-12",
};

/**
 * The `role="status"` region that announces a pending state.
 *
 * `aria-live="polite"` plus visible text means a screen reader says "Loading…"
 * without interrupting, and a reader who cannot see the spinner still knows
 * something is happening. When there is no `text`, the region is labelled from
 * an Arabic default rather than left empty — an unlabelled status region is
 * announced as nothing.
 */
export function Loading({ size = "md", text = "جارٍ التحميل…", fullScreen = false, className = "" }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 py-12 ${fullScreen ? "min-h-[70dvh]" : ""} ${className}`.trim()}
    >
      <svg
        aria-hidden="true"
        className={`${SIZES[size]} animate-spin text-accent`}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text && <p className="text-sm text-ink-muted">{text}</p>}
    </div>
  );
}
