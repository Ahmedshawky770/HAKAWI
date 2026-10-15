"use client";

import React from "react";

import { RemoteImage } from "./RemoteImage";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The avatar with its fallback.
 *
 * A letter avatar is not a nicety: a large share of accounts have no image, and
 * a grey circle where a person's name should be makes a comment list unreadable.
 * The initial is rendered in the accent so a wall of them still looks designed,
 * and `alt` is empty on purpose — the name is always adjacent in the layout, so
 * announcing the file name again is noise.
 *
 * The fallback for an unnamed author is the localized question mark, so the
 * placeholder reads as Arabic `؟` or Latin `?` depending on the active locale.
 */
export function Avatar({
  src,
  name,
  size = "md",
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const { common } = useStrings();

  const sizes = {
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
    lg: "size-16 text-xl",
    xl: "size-24 text-3xl",
  } as const;

  const initial = name.trim().charAt(0) || common.avatarFallback;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-raised font-arabic-heading font-bold text-accent-ink ${sizes[size]} ${className}`.trim()}
    >
      {src ? (
        <RemoteImage src={src} className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
