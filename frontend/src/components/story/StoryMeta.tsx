import React from "react";
import Link from "next/link";

export const UNCATEGORIZED_LABEL = "بدون تصنيف";
export const AUTHOR_PROFILE_LABEL = "ملف الكاتب";

interface StoryAuthor {
  id: string;
  name: string | null;
}

interface StoryBylineProps {
  author: StoryAuthor;
  linkToProfile?: boolean;
  className?: string;
}

/**
 * The byline: "بواسطة <name>", or a link to the writer's profile when the page
 * can spare the row.
 *
 * The three rules it enforces are accessibility rules, not typography ones:
 *
 * - **Nothing renders for a missing name.** A bare "بواسطة" is worse than no
 *   byline; an unnamed writer still gets a reachable profile link when the
 *   caller asks for one.
 * - **The link is distinguishable without colour** — underlined, so the
 *   affordance survives a monochrome screen and a colour-blind reader.
 * - **The accent colour is the text-safe one** (`accent-ink`), which in light
 *   mode is a deeper amber than the fill hue, because a link is text.
 */
export function StoryByline({ author, linkToProfile = false, className = "" }: StoryBylineProps) {
  const name = author.name?.trim() ?? "";
  const href = `/users/${author.id}`;

  if (!name && !linkToProfile) return null;

  if (!name) {
    return (
      <Link
        href={href}
        aria-label={AUTHOR_PROFILE_LABEL}
        className={`font-medium text-accent-ink underline underline-offset-4 hover:text-accent ${className}`.trim()}
      >
        {AUTHOR_PROFILE_LABEL}
      </Link>
    );
  }

  if (linkToProfile) {
    return (
      <Link
        href={href}
        className={`font-medium text-accent-ink underline underline-offset-4 hover:text-accent ${className}`.trim()}
      >
        بواسطة {name}
      </Link>
    );
  }

  return <p className={className}>بواسطة {name}</p>;
}

interface StoryCategoryProps {
  category: string | null;
  variant?: "chip" | "inline";
  className?: string;
}

/**
 * The category, in two forms: a chip where the category is the point (a card
 * footer, a filter summary) and inline where it is metadata (a byline row).
 *
 * "بدون تصنيف" is a dashed, italic, muted chip rather than a solid one: the
 * absence of a category is information the writer should see as such, and a solid
 * pill would claim the story has a category it does not have.
 */
export function StoryCategory({ category, variant = "chip", className = "" }: StoryCategoryProps) {
  const label = category?.trim() ? category : UNCATEGORIZED_LABEL;
  const uncategorized = label === UNCATEGORIZED_LABEL;

  if (variant === "inline") {
    return (
      <span className={`capitalize ${uncategorized ? "italic text-ink-faint" : ""} ${className}`.trim()}>{label}</span>
    );
  }

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs capitalize ${
        uncategorized
          ? "border border-dashed border-line-strong text-ink-faint"
          : "bg-chrome-soft text-chrome-ink"
      } ${className}`.trim()}
    >
      {label}
    </span>
  );
}

/** The date, formatted for the reader's locale and never ambiguous. */
export function StoryDate({ value, intl = "ar-EG" }: { value: string; intl?: string }) {
  return (
    <time dateTime={value} className="hk-numeric text-xs text-ink-muted">
      {new Date(value).toLocaleDateString(intl, { year: "numeric", month: "long", day: "numeric" })}
    </time>
  );
}
