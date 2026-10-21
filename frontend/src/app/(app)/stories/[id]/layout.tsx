import type { Metadata } from "next";
import { headers } from "next/headers";

import { getStoryOnce } from "@/lib/server-story";
import { intlLocale, stringsFor } from "@/lib/i18n";
import { localeFromAcceptLanguage, SITE_URL } from "@/lib/site-url";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The metadata of a story, and of the pages beneath it.
 *
 * WHY A LAYOUT AND NOT THE PAGE. The story page is a CLIENT component — it
 * owns the reactions, the optimistic updates and the two-step delete — and a
 * client component cannot export `generateMetadata`. A layout can, and a
 * layout is a server component, so the story's title reaches the browser tab,
 * the link preview and the search engine while the page itself stays
 * interactive.
 *
 * WHY THE TITLE IS THE STORY'S TITLE. It used to be the route, with a database
 * id in it: a tab reading "القصة 7f3c…" and a link preview with the same. The
 * title of the story is the one thing a reader recognises, and it is one
 * request away.
 *
 * THE DESCRIPTION IS THE EXCERPT, TRIMMED. A search result shows about a
 * hundred and sixty characters; a description longer than that is truncated by
 * the engine anyway, and one that is empty is a line of "no description" in
 * the result. A story with no excerpt — a draft, whose excerpt is
 * `string | null` — therefore gets the product's own description rather than
 * an empty string.
 *
 * THE LOCALE IS THE REQUEST'S, NOT A CONSTANT. `generateMetadata` runs on the
 * SERVER, where the reader's stored locale (localStorage, and the `lang`
 * attribute the bootstrap writes) does not exist yet. The one server-side
 * signal about the reader's language is the `Accept-Language` header, so that
 * is what is read: an English reader's shared link gets an English title, an
 * English description and an English `og:locale` instead of an Arabic screen
 * on a page whose content is not Arabic.
 *
 * THE REQUEST IS BOUNDED. The fetch has a timeout, so an API that is slow or
 * down degrades this page to the product's own title instead of holding the
 * whole response until the proxy gives up.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  // `headers()` is async in Next 15 and later, and reading it is what makes
  // this route dynamic — which is the point: the metadata is computed per
  // request, for the reader who made it.
  const requestHeaders = await headers();
  const locale = localeFromAcceptLanguage(requestHeaders.get("accept-language"));
  const strings = stringsFor(locale);

  const story = await getStoryOnce(id).catch(() => null);

  if (!story) {
    return {
      title: strings.shell.appTitle,
      description: strings.shell.appDescription,
    };
  }

  // An empty description is worse than a generic one: the engine shows a line
  // of "no description" for the first, and a line about the product for the
  // second.
  const description = (story.excerpt ?? "").slice(0, 160) || strings.shell.appDescription;

  return {
    title: story.title,
    description,
    alternates: {
      canonical: `${SITE_URL}/stories/${story.id}`,
    },
    openGraph: {
      type: "article",
      title: story.title,
      description,
      url: `${SITE_URL}/stories/${story.id}`,
      siteName: strings.shell.brand,
      // The Open Graph form of the locale is `language_TERRITORY`, and the
      // dictionary's own `intlLocale` is the one place that says which
      // territory the product uses.
      locale: intlLocale(locale).replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title: story.title,
      description,
    },
  };
}

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
