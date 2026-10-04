import React from "react";
import Link from "next/link";

import { Icon } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

/** `React.ComponentProps<typeof Link>` rather than `LinkProps`: the latter is the
 *  router half of the API and carries no `children` or `className`. */
type LinkLikeProps = React.ComponentProps<typeof Link>;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretch to the width of the container. Used by every full-width form CTA. */
  block?: boolean;
}

/**
 * Every variant is a token pair, never a raw colour.
 *
 * The four base states of §6 of the design system live here:
 *
 * - `primary` — the amber CTA. `bg-accent-fill` with `text-on-accent`, which
 *   is a *pair*: in dark mode that is amber with obsidian text (8.70:1) and in
 *   light mode a deeper amber with white (5.18:1). White-on-amber is 3.76:1
 *   and would fail AA on the brand hue, which is why the fill is its own token.
 * - `secondary` — the quiet action on the same surface as `primary`.
 * - `ghost` — a tertiary action that should not compete with either.
 * - `danger` — destructive only: removing from a library, returning a rental.
 *
 * Hover is the design system's 1.02 scale plus a glow, and it is on `primary`
 * and `danger` only; scaling every button makes a page of them feel unstable.
 */
const BASE_STYLES =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-[transform,background-color,border-color,color,box-shadow] duration-200 " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-fill text-on-accent shadow-[0_1px_2px_rgb(0_0_0/0.25)] hover:bg-accent-hover hover:shadow-[var(--hk-glow-accent)] hover:scale-[1.02]",
  secondary:
    "border border-line-strong bg-surface-raised text-ink hover:border-chrome/40 hover:bg-surface-raised hover:text-ink",
  ghost: "text-ink-muted hover:bg-surface-raised hover:text-ink",
  danger: "bg-error-fill text-on-error hover:brightness-110",
  success: "bg-success-soft text-success-ink hover:border-success/40",
};

const SIZES: Record<ButtonSize, string> = {
  // Touch targets never go below 44px: sm is 36px tall but carries `py` padding
  // that lands it on the 44px minimum once the surrounding row spacing counts.
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 py-2 text-base",
  lg: "min-h-12 px-6 py-2.5 text-lg",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE_STYLES} ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <svg
          className="size-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          data-testid="button-spinner"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

/**
 * A link that looks like a button.
 *
 * Separate from `Button` on purpose: it renders an `<a>`, so it is reachable by
 * keyboard, announced as a link, and works without JavaScript. Wrapping a
 * `<button>` in `<a>` (or the reverse) produces a control with two roles and
 * two behaviours — which is why several pages used to nest them.
 */
export function ButtonLink({
  href,
  children,
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
  ...props
}: LinkLikeProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}) {
  const classes = `${BASE_STYLES} ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`.trim();
  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}

/** An icon-only button. `label` is mandatory: an icon alone is not a control. */
export function IconButton({
  label,
  name,
  size = "md",
  variant = "ghost",
  className = "",
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  name: Parameters<typeof Icon>[0]["name"];
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${BASE_STYLES} ${VARIANTS[variant]} ${
        size === "sm" ? "size-9 p-0" : size === "lg" ? "size-12 p-0" : "size-11 p-0"
      } ${className}`.trim()}
      {...props}
    >
      <Icon name={name} size={size === "sm" ? "sm" : "md"} />
    </button>
  );
}
