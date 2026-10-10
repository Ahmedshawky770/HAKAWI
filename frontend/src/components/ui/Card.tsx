import React from "react";
import Link from "next/link";

/** `React.ComponentProps<typeof Link>` rather than `LinkProps`: the latter is the
 *  router half of the API and carries no `children` or `className`. */
type LinkLikeProps = React.ComponentProps<typeof Link>;

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Raise the card on hover and let it take focus. For cards that are links. */
  interactive?: boolean;
  as?: "div" | "article" | "section" | "li";
}

/**
 * The structural surface of §6: warm charcoal in dark, warm white in light, one
 * hairline border, an 8px radius.
 *
 * `p-6` is the card padding and `gap-4` the gap between a card's own parts —
 * both from §4 of the design system. `interactive` exists so a clickable card
 * looks like a control: the same glow the hover state has everywhere else, plus
 * a focus ring that follows the keyboard.
 */
export function Card({ children, className = "", interactive = false, as: Tag = "div" }: CardProps) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-surface transition-shadow duration-200 ${
        interactive
          ? "hover:border-chrome/30 hover:shadow-[var(--hk-glow-chrome)]"
          : ""
      } ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className = "" }: Omit<CardProps, "as">) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = "" }: Omit<CardProps, "as">) {
  return <div className={`p-6 ${className}`.trim()}>{children}</div>;
}

export function CardFooter({ children, className = "" }: Omit<CardProps, "as">) {
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

/** A card whose whole surface is one link target. */
export function CardLink({ href, children, className = "" }: LinkLikeProps & { children: React.ReactNode }) {
  return (
    <Link href={href} className={`block rounded-xl focus-visible:outline-2 ${className}`.trim()}>
      <Card interactive className="h-full">
        {children}
      </Card>
    </Link>
  );
}

/**
 * Page title block: an `h1`, an optional supporting line, and the action that
 * belongs to the page (never a global action — that belongs in the header).
 */
export function PageHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="text-3xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  );
}
