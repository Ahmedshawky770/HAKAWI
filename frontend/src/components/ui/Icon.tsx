import type { SVGProps } from "react";

/**
 * The product's icon set: one file, one stroke weight, one 24px grid.
 *
 * WHY AN INLINE SET AND NOT AN ICON PACKAGE. Three reasons, all of them
 * decisions rather than preference. Every glyph here is drawn on the same grid
 * with the same 1.75 stroke, which is what makes a nav column look designed
 * instead of assembled. Nothing is fetched at runtime, so an icon can never be
 * the reason a first paint is late. And the directional glyphs are mirrored by
 * a single class in the RTL layer, which a packaged icon set would not do.
 *
 * Icons are decorative by default here (`aria-hidden`), because every control
 * that uses one also carries a label. An icon that *is* the label must be
 * passed `title`, which turns the glyph into an `img` with an accessible name.
 */

const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3.25a1 1 0 0 0 1-1V9.75",
  book: "M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5Zm0 0V19m16-13.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 1 1.5 1.5ZM20 5.5V19",
  library: "M4 7h16M4 7l1.5 12.5a1 1 0 0 0 1 .9h11a1 1 0 0 0 1-.9L20 7M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  trophy: "M7 4h10v4a5 5 0 0 1-10 0Zm0 2H5.5a.5.5 0 0 0-.5.6C5.4 13.2 7.6 14 8.4 14M17 6h1.5a.5.5 0 0 1 .5.6c-.4 3.6-2.6 4.4-3.4 4.4M10 14h4v3.5a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 10 17.5Z",
  message: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z",
  bell: "M6 9a6 6 0 1 1 12 0c0 3.2.8 4.9 1.6 6a.6.6 0 0 1-.45.97H4.85A.6.6 0 0 1 4.4 15c.8-1.1 1.6-2.8 1.6-6Zm4 9.5a2 2 0 0 0 4 0",
  wallet: "M3.5 8.5A2.5 2.5 0 0 1 6 6h11.5a1 1 0 0 1 1 1v1.5M3.5 8.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-2.5M20.5 11H16a2 2 0 0 0 0 4h4.5a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5ZM3.5 8.5 17 4.6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5a7.5 7.5 0 0 1 15 0",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5",
  pen: "M4 20h4l10-10-4-4L4 16v4Zm10-14 4 4m-2.5-6.5 1.5-1.5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L19 17",
  heart: "M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z",
  eye: "M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  comment: "M20 12a8 8 0 1 1-3.4-6.4M4.5 20.5l.9-3.4A8 8 0 0 1 20 12",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "m6 6 12 12M18 6 6 18",
  check: "m5 13 4.5 4.5L19 7",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.2 4-5.4 4-9s-1.5-6.8-4-9c-2.5 2.2-4 5.4-4 9s1.5 6.8 4 9Zm-8.5-9h17",
  logout: "M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2m4-6 4 4-4 4m4-4H9",
  trending: "M3.5 16.5 9 11l3.5 3.5L20.5 6.5m0 0h-5m5 0v5",
  sparkle: "M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9Zm6.5 10 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z",
  edit: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z",
  trash: "M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m3 0-.8 12.1a1.5 1.5 0 0 1-1.5 1.4H8.3a1.5 1.5 0 0 1-1.5-1.4L6 7m4 4v6m4-6v6",
  menu: "M4 7h16M4 12h16M4 17h16",
  warning: "M12 8.5v4.5m0 3h.01M10.3 4.9 3 17.5A1.5 1.5 0 0 0 4.3 20h15.4a1.5 1.5 0 0 0 1.3-2.5L13.7 4.9a1.5 1.5 0 0 0-2.6 0Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9.5V16m0-7.5h.01",
  chevron: "m14 6-6 6 6 6",
  arrow: "M20 12H4m0 0 6-6m-6 6 6 6",
  filter: "M4 6h16M7 12h10m-7 6h4",
  dots: "M12 6.5h.01M12 12h.01M12 17.5h.01",
  calendar: "M4.5 8.5A1.5 1.5 0 0 1 6 7h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Zm2-3v3m11-3v3M4.5 11h15",
  tag: "M4 5.5A1.5 1.5 0 0 1 5.5 4H11l8 8-6.5 6.5-8-8Zm4.5 3.5h.01",
  users: "M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5.5a3 3 0 1 0 0-6m3 13.5a6 6 0 0 0-5-5.9m-11 5.9a6 6 0 0 1 5-5.9",
  download: "M12 4v10m0 0 4-4m-4 4-4-4M5 18.5h14",
} as const;

export type IconName = keyof typeof PATHS;

/** Glyphs whose meaning depends on direction and must mirror in RTL. */
const DIRECTIONAL = new Set<IconName>(["chevron", "arrow", "logout"]);

export type IconSize = "sm" | "md" | "lg";

const SIZES: Record<IconSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: IconSize;
  /** Give the glyph an accessible name. Omit it when the control has a label. */
  title?: string;
  className?: string;
}

export function Icon({ name, size = "md", title, className = "", ...props }: IconProps) {
  const decorative = title === undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${SIZES[size]} ${DIRECTIONAL.has(name) ? "hk-flip-rtl" : ""} ${className}`.trim()}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      {...(decorative ? {} : { "aria-label": title })}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
