import React from "react";

import { controlClassName, describedBy, Field, type FieldProps } from "./Field";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, FieldProps {}

/**
 * The text input.
 *
 * `className` lands on the CONTROL, not on the field wrapper — that is where
 * callers mean it when they pass `flex-1` or `w-1/2`, and changing it would
 * silently restyle the wrong box on every page that already used it. Layout of
 * the field itself is `wrapperClassName`.
 *
 * `px-3 py-2` comes from §4 of the design system; the label, the error and the
 * `aria-describedby` wiring come from `Field`, so this control, the textarea and
 * the select beside it are wired identically.
 */
export function Input({ label, error, hint, className = "", wrapperClassName, id, ...props }: InputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      inputId={inputId}
      label={label}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={controlClassName(error, className)}
        {...props}
      />
    </Field>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

/**
 * The long-form control. Hakawi's whole product is prose, so this is the input
 * that matters most: the Arabic body face, comfortable vertical rhythm, and a
 * minimum height so the page does not resize on every keystroke.
 */
export function Textarea({
  label,
  error,
  hint,
  className = "",
  wrapperClassName,
  id,
  rows = 10,
  ...props
}: TextareaProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <Field inputId={inputId} label={label} error={error} hint={hint} className={wrapperClassName}>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={`${controlClassName(error, `font-arabic-body leading-7 ${className}`.trim())} min-h-32`}
        {...props}
      />
    </Field>
  );
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, FieldProps {
  /** The options. Taken as a prop so a caller cannot forget `key` on children. */
  options: { value: string; label: string }[];
}

/**
 * The select, styled to match.
 *
 * The chevron is a background image rather than a wrapper element: a `<select>`
 * cannot take a child, and overlaying a positioned icon on top of a native select
 * is the usual cause of a control that intercepts its own clicks.
 */
export function Select({
  label,
  error,
  hint,
  className = "",
  wrapperClassName,
  id,
  options,
  ...props
}: SelectProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <Field inputId={inputId} label={label} error={error} hint={hint} className={wrapperClassName}>
      <select
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={controlClassName(error, `cursor-pointer appearance-none bg-no-repeat pe-9 ${className}`.trim())}
        style={{
          backgroundImage: CHEVRON,
          backgroundSize: "1rem",
          backgroundPosition: "left 0.75rem center",
        }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface text-ink">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The chevron, as an inline SVG data URI. Inlined rather than imported because a
 * native select cannot host an SVG element, and `currentColor` is not available
 * in a data URI — so the stroke matches `ink-faint` in both themes, which is the
 * one colour that is not the subject of the control.
 */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238f8a84' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";
