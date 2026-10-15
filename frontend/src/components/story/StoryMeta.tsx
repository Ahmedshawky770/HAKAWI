"use client";

import React from "react";
import Link from "next/link";

import { useLocale } from "@/components/providers/LocaleProvider";
import { storyCategoryLabel } from "@/lib/i18n/story";
import { formatLongDate } from "@/lib/i18n";

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
 * The byline: "بواسطة <name>" / "By <name>" — the story dictionary's
 * `authorByline`, never a literal — or a link to the writer's profile when the
 * page can spare the row.
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
  const { strings } = useLocale();
  const name = author.name?.trim() ?? "";
  const href = `/users/${author.id}`;
  const profileLabel = strings.story.authorProfile;

  if (!name && !linkToProfile) return null;

  if (!name) {
    return (
      <Link
        href={href}
        aria-label={profileLabel}
        className={`font-medium text-accent-ink underline underline-offset-4 hover:text-accent ${className}`.trim()}
      >
        {profileLabel}
      </Link>
    );
  }

  if (linkToProfile) {
    return (
      <Link
        href={href}
        className={`font-medium text-accent-ink underline underline-offset-4 hover:text-accent ${className}`.trim()}
      >
        {strings.story.authorByline(name)}
      </Link>
    );
  }

  return <p className={className}>{strings.story.authorByline(name)}</p>;
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
 * The wire value is localized through the story dictionary — an English reader
 * sees "Non-fiction", not the raw "non-fiction" the API sends — and a value the
 * dictionary does not know is passed through untouched rather than blanked.
 *
 * A missing category is a dashed, italic, muted chip rather than a solid one:
 * the absence of a category is information the writer should see as such, and a
 * solid pill would claim the story has a category it does not have.
 *
 * **NO `capitalize` ON THE LABEL.** The class was there for the raw wire value,
 * which arrived lower-cased and needed CSS to look like a word. The label is now
 * the dictionary's authored string, and `text-transform: capitalize` uppercases
 * the first letter of every word — so the English "Non-fiction" would render as
 * "Non-Fiction", and what the reader sees would disagree with the one place the
 * copy lives. Casing is the dictionary's job now; the class is gone.
 */
export function StoryCategory({ category, variant = "chip", className = "" }: StoryCategoryProps) {
  const { locale, strings } = useLocale();
  const trimmed = category?.trim() ?? "";
  const label = trimmed ? storyCategoryLabel(trimmed, locale) : strings.story.uncategorized;
  const uncategorized = !trimmed;

  if (variant === "inline") {
    return (
      <span className={`${uncategorized ? "italic text-ink-faint" : ""} ${className}`.trim()}>{label}</span>
    );
  }

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs ${
        uncategorized
          ? "border border-dashed border-line-strong text-ink-faint"
          : "bg-chrome-soft text-chrome-ink"
      } ${className}`.trim()}
    >
      {label}
    </span>
  );
}

/**
 * The date, formatted for the reader's locale and never ambiguous.
 *
 * `formatLongDate` — not a bare `toLocaleDateString` — because it pins the
 * numbering system: the month name follows the reader's language while the
 * digits stay Western, which is the convention every other figure in the
 * product already follows (`lib/i18n/index.ts`).
 */
export function StoryDate({ value, intl = "ar-EG" }: { value: string; intl?: string }) {
  return (
    <time dateTime={value} className="hk-numeric text-xs text-ink-muted">
      {formatLongDate(value, intl)}
    </time>
  );
}
