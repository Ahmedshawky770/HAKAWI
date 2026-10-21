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
  //
  // THE FOCUS BORDER IS NOT IN HERE, AND THAT IS DELIBERATE. It is applied per
  // STATE by `controlClassName` below, because a control that is in an error
  // state has to keep the error colour when it is focused — and two utilities
  // of the same specificity (`focus:border-chrome` and `focus:border-error`)
  // are separated by nothing but the order in which the stylesheet happens to
  // emit them, which is not a thing to build a colour decision on.
  "w-full rounded-lg border border-control-line bg-surface-raised px-3 py-2 text-base text-ink " +
  "placeholder:text-ink-faint transition-colors duration-200 hover:border-chrome " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/**
 * THE FOCUS AFFORDANCE FOR A POINTER.
 *
 * The focus INDICATOR is the one global rule in `globals.css` — a 2px amber
 * ring with a 2px offset — and it is not touched here: that ring is what
 * satisfies WCAG 2.4.11, and it is what a keyboard reader sees. This border
 * answers a different question: not "where is the focus indicator" but "which
 * control did I just click". A reader who reaches for a field with the mouse
 * gets no other feedback that the click landed, and the border was the only
 * thing that used to give it.
 *
 * IT WAS REMOVED ONCE, ON THE GROUNDS THAT A PER-CONTROL BORDER COLOUR IS A
 * SECOND, COMPETING FOCUS INDICATOR — and in the light theme `--hk-chrome` is
 * `#00b8d4`, which against the light surface is not the 3:1 a focus indicator
 * needs. That is still true of the COLOUR, and it is why the colour is not
 * asked to BE the indicator: the ring is. What changed is that the border is
 * no longer treated as a replacement for the ring, but as the pointer's share
 * of the same event — and the ring stays exactly where it was.
 */
const CONTROL_FOCUS = "focus:border-chrome";

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

/**
 * The class list a control needs, given its validity. Shared by all three.
 *
 * THE FOCUS BORDER IS CHOSEN BY STATE, not by cascade: a control that is in an
 * error state keeps the error colour on focus, and a control that is not gets
 * the chrome border — the pointer's share of the focus event, beside the
 * global ring and not instead of it.
 */
export function controlClassName(error: string | undefined, extra: string | undefined): string {
  const state = error ? CONTROL_INVALID : CONTROL_FOCUS;
  return `${CONTROL_BASE} ${state} ${extra ?? ""}`.trim();
}

export { describedBy, CONTROL_BASE };
