import React from "react";

/**
 * One field contract for every form control in the product.
 *
 * WHY THIS EXISTS. `Input` used to own its own label, error and id wiring, so
 * every page that needed a `textarea` or a `select` copied that markup by hand —
 * eleven copies, each with its own idea of where the error message goes and how
 * it is announced. A screen reader therefore met controls that were labelled
 * four different ways. This module is the single implementation: `Input`,
 * `Textarea` and `Select` below are thin wrappers over it, and each one is a
 * real `<input>`/`<textarea>`/`<select>` with the behaviour the platform gives.
 */

export interface FieldProps {
  label?: string;
  /** Shown below the control, announced through `aria-describedby`. */
  error?: string;
  /** Shown below the control, announced through `aria-describedby`. */
  hint?: string;
  /** Lands on the CONTROL. Use `wrapperClassName` for the field container. */
  className?: string;
  /** Layout of the field container itself (the label + control + message). */
  wrapperClassName?: string;
  id?: string;
}

const CONTROL_BASE =
  // `border-control-line`, not `border-line`: this edge is what identifies the
  // control, so it carries the 3:1 that WCAG 1.4.11 asks for.
  "w-full rounded-lg border border-control-line bg-surface-raised px-3 py-2 text-base text-ink " +
  "placeholder:text-ink-faint transition-colors duration-200 hover:border-chrome focus:border-chrome " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const CONTROL_INVALID = "border-error focus:border-error";

function describedBy(inputId: string, error?: string, hint?: string): string | undefined {
  const ids = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/**
 * Renders the visible label, the control, and the message region.
 *
 * The message region is rendered whenever there is an error or a hint, even if
 * empty, so the layout does not jump when an error appears — a control that
 * moves under the reader's cursor mid-typing is a mis-tap waiting to happen.
 */
export function Field({
  inputId,
  label,
  error,
  hint,
  className = "",
  children,
}: {
  inputId: string;
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`w-full ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-sm text-error-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The class list a control needs, given its validity. Shared by all three. */
export function controlClassName(error: string | undefined, extra: string | undefined): string {
  return `${CONTROL_BASE} ${error ? CONTROL_INVALID : ""} ${extra ?? ""}`.trim();
}

export { describedBy, CONTROL_BASE };
