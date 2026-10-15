"use client";

import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The skip-to-content link in the root layout.
 *
 * The root layout cannot use `useLocale` itself without becoming a client
 * component (it owns `<html>`), so the anchor is extracted into this leaf
 * client component, which renders the label in the active locale. The href
 * targets the `#main-content` landmark that `AppShell` renders on `<main>`.
 */
export function SkipLink() {
  const strings = useStrings();
  return (
    <a href="#main-content" className="hk-skip-link">
      {strings.shell.skipToContent}
    </a>
  );
}
