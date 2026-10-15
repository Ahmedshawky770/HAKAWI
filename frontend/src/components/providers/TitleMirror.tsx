"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useLocale } from "@/components/providers/LocaleProvider";
import { stringsFor } from "@/lib/i18n";

/**
 * The document title and description meta, in the reader's language.
 *
 * WHY THIS IS ITS OWN COMPONENT AND NOT ONE MORE EFFECT IN `LocaleProvider`.
 *
 * 1. **It has to listen to the route, and the provider must not.** Next
 *    re-applies the route's metadata on every route commit, and for the routes
 *    that own no metadata of their own that means the root layout's static
 *    Arabic `<title>`. So a reader who flips to English and then clicks a nav
 *    link gets `حكاوي` in the tab — the page itself is English — until the next
 *    full reload. Reacting to the route means subscribing to it, and
 *    `usePathname` in the root provider would reach the 23 suites that mount the
 *    provider while mocking `next/navigation` without exporting it — for a title.
 *    Rendered only by the root layout, this component reaches none of them.
 * 2. **The provider owns locale state; the document is not locale state.**
 *    `LocaleProvider` is now nothing but `lang`, `dir`, the store and the
 *    dictionaries, and it can be tested without a document whose `<title>`
 *    matters.
 * 3. **The write has to know who owns the title.** A root provider's passive
 *    effect runs LAST — after the route's own metadata is on the document — so
 *    an unconditional write destroys the four routes that ship their own
 *    `generateMetadata` (story comments and reactions, user followers and
 *    following). So the effect asks the document itself: if the title is the
 *    chrome's own (the app title in either locale, or nothing at all), it writes
 *    the active locale's; otherwise a route owns it and the write is skipped.
 *
 * WHAT IT DELIBERATELY CANNOT DO: there is no locale-aware server metadata, so a
 * route-owned title stays Arabic after a toggle. The root `metadata` export is a
 * static object that cannot read the reader's stored preference, and replacing a
 * route's title with the site name is not a translation.
 */
export function TitleMirror() {
  const { strings } = useLocale();
  const pathname = usePathname();

  useEffect(() => {
    const chromeTitle = (locale: "ar" | "en") => stringsFor(locale).shell.appTitle;
    const titleIsChrome = document.title === "" || document.title === chromeTitle("ar") || document.title === chromeTitle("en");
    if (!titleIsChrome) return;

    document.title = strings.shell.appTitle;

    const meta = document.querySelector('meta[name="description"]');
    if (!meta) return;
    // The same ownership test for the description: a route's own summary is
    // left alone, an empty or chrome-owned one is mirrored.
    const current = meta.getAttribute("content") ?? "";
    const descriptionIsChrome =
      current === "" ||
      current === stringsFor("ar").shell.appDescription ||
      current === stringsFor("en").shell.appDescription;
    if (descriptionIsChrome) meta.setAttribute("content", strings.shell.appDescription);
  }, [strings, pathname]);

  return null;
}
