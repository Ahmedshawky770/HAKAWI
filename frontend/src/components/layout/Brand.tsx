import React from "react";
import Link from "next/link";

/**
 * The wordmark.
 *
 * One component, because the brand appears in three places — the header on
 * mobile, the start sidebar on desktop, and every auth page — and three
 * hand-drawn variants is how a logo ends up three different sizes.
 *
 * The mark is a rounded amber tile with `ح` reversed out of it: the only element
 * that stays a solid shape in both themes, so it anchors the layout. The tile
 * always uses `bg-accent-fill` with `text-on-accent`, which is the pair that
 * clears AA in either theme (8.70:1 dark, 5.18:1 light).
 */
export function Brand({
  href,
  size = "md",
  showName = true,
  className = "",
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  className?: string;
}) {
  const tiles = {
    sm: "size-9 text-lg rounded-lg",
    md: "size-10 text-xl rounded-xl",
    lg: "size-14 text-3xl rounded-2xl",
  } as const;

  const names = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
  } as const;

  const mark = (
    <span
      aria-hidden="true"
      className={`${tiles[size]} flex shrink-0 items-center justify-center bg-accent-fill font-arabic-heading font-bold text-on-accent`}
    >
      ح
    </span>
  );

  const name = showName ? (
    <span className={`${names[size]} font-arabic-heading font-bold text-ink`}>حكاوي</span>
  ) : null;

  const classes = `flex items-center gap-2 ${className}`.trim();

  if (!href) {
    return (
      <span className={classes} aria-label={showName ? undefined : "حكاوي"}>
        {mark}
        {name}
      </span>
    );
  }

  return (
    <Link href={href} className={`${classes} rounded-lg`} aria-label={showName ? undefined : "حكاوي"}>
      {mark}
      {name}
    </Link>
  );
}
