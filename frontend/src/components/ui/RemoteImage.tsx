import React from "react";

/**
 * The one raw `<img>` in the design system, and the reason there is exactly one.
 *
 * WHY A RAW <img> AND NOT `next/image`: the src is a presigned S3 URL or a CDN URL
 * from `STORAGE_CDN_URL`, both chosen at runtime, so no static `remotePatterns`
 * entry can allowlist them — and a wildcard would open the optimizer to every host
 * on the internet. `next/image` can therefore not serve these at all, which leaves
 * this element as the deliberate choice rather than an oversight.
 *
 * That reasoning lives here instead of beside each cover, avatar and rental
 * thumbnail, because a disable directive repeated at eight call sites drifts the
 * moment the justification changes — and when it does, this is the single file to
 * edit before deleting the directive.
 *
 * `alt` DEFAULTS TO EMPTY, AND THAT IS A DECISION PER CALL SITE. An empty `alt`
 * marks the image as decorative, which is right for a thumbnail that sits next
 * to the title it repeats and wrong for a cover that IS the content: a book
 * detail page renders the cover outside the card, with the title beside it, and
 * a screen-reader user is told nothing about the book they are looking at. So
 * the caller that shows the image as content passes the book's title; the
 * callers that repeat a nearby label do not.
 */
export function RemoteImage({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- runtime-configured remote host cannot be allowlisted
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />;
}
