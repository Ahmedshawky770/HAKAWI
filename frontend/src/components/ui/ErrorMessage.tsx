"use client";

import React from "react";

import { Button } from "./Button";
import { Icon } from "./Icon";

interface ErrorMessageProps {
  error: string | Error | null;
  onRetry?: () => void;
  /** Overridable so a shared component can be labelled by its context. */
  title?: string;
  retryLabel?: string;
  className?: string;
}

/**
 * The failure surface. Semantic error tokens, never a raw red.
 *
 * `role="alert"` on the banner and `aria-live` are what make this announced the
 * moment it appears rather than the moment the reader happens to look. The
 * retry control is a real `Button`, so it gets the product's focus ring and
 * 44px touch target instead of a bespoke one.
 */
export function ErrorMessage({
  error,
  onRetry,
  title = "حدث خطأ",
  retryLabel = "أعد المحاولة",
  className = "",
}: ErrorMessageProps) {
  const message = error instanceof Error ? error.message : error;

  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-error/40 bg-error-soft p-4 ${className}`.trim()}
    >
      <Icon name="warning" className="mt-0.5 shrink-0 text-error-ink" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-error-ink">{title}</h3>
        <p className="mt-1 break-words text-sm text-ink">{message}</p>
        {onRetry && (
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {retryLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The success counterpart, for the flows that confirm rather than warn:
 * "the reset link is on its way", "the entry was submitted".
 */
export function SuccessMessage({
  title = "تم",
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 ${className}`.trim()}
    >
      <Icon name="check" className="mt-0.5 shrink-0 text-success-ink" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-success-ink">{title}</h3>
        <div className="mt-1 text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}
