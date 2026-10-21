import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

/**
 * The canonical origin is a shared constant, and it lives in `lib/site-url.ts`
 * — a route file is not a library. It is re-exported here because this file
 * used to be where the rest of the app imported it from, and a consumer that
 * still does should keep working.
 */
export { SITE_URL };

/**
 * `robots.txt`.
 *
 * The product is a signed-in reading platform: the pages behind the sign-in
 * are the reader's own, and a crawler has no business listing them. The public
 * surface — the stories and the catalogue — is open, and the sitemap points at
 * it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // NO `Allow` RULE, ON PURPOSE. With no `Allow` rule the default is
        // allow-all, and the `Disallow` rules below are what actually close
        // the private surface. An `Allow: ["/"]` beside the `Disallow` lines
        // reads as "crawl everything" to a human, while the crawlers
        // themselves apply the LONGEST match — so the rule was a no-op that
        // said the opposite of what it did.
        disallow: [
          "/api/",
          "/profile",
          "/messages",
          "/notifications",
          "/library",
          "/rentals",
          "/payments",
          "/moderation",
          "/contests/publisher",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
