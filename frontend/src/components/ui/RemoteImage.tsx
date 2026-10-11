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
 */
export function RemoteImage({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- runtime-configured remote host cannot be allowlisted
  return <img src={src} alt="" className={className} loading="lazy" decoding="async" />;
}
