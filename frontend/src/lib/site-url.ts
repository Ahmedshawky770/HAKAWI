import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/preferences";

/**
 * The canonical origin of the site.
 *
 * ONE place, because a sitemap that names one origin and a robots file that
 * names another is a crawler told two different things about where the product
 * lives. The same constant is the `metadataBase` of the root layout, so the
 * `og:image` of every page resolves against the host the product is actually
 * served from.
 *
 * WHY IT IS A LIBRARY AND NOT A ROUTE FILE. It used to live in `app/robots.ts`
 * and be imported from there by the sitemap, the root layout and the story
 * layout. A route file is not a module the rest of the app may depend on: it
 * is a convention with a default export that Next reads, and importing from it
 * couples three unrelated routes to one route's file. It is a constant with no
 * Next-specific behaviour, so it lives beside the other shared constants; the
 * robots file re-exports it for anything that still asks for it there.
 *
 * THE VARIABLE IS THE ONE THE DEPLOYMENT SETS. The Helm chart, docker-compose
 * and the Playwright config all publish the app's origin as
 * `NEXT_PUBLIC_APP_URL`; the canonical origin is that value, so the robots
 * file, the sitemap and the link previews name the host the reader is on
 * instead of a second, different one.
 *
 * IT IS READ WHEN THE IMAGE IS BUILT, AND NOT AT REQUEST TIME. `robots.txt`
 * is a prerendered route — its body is written into the image when the app is
 * built — so the variable has to be present in the build environment, not only
 * in the running container. A deployment that wants a different origin
 * rebuilds the image with it.
 *
 * AND A DYNAMIC ROUTE THAT READS IT IS NOT READING IT LIVE. This is a
 * constant, and `NEXT_PUBLIC_*` is INLINED by the compiler when the image is
 * built, so a route rendered per request — the sitemap, the link previews —
 * names the origin the IMAGE was built with, not the one the container
 * happens to be configured with. That is deliberate: one origin, agreed at
 * build time, is better than two that disagree. A deployment that sets
 * `NEXT_PUBLIC_APP_URL` only in the running container gets the default here,
 * and the honest fix is to pass the public variables at build time — which is
 * what the Dockerfile and the CI workflows do.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.hakawi.com").replace(
  /\/+$/,
  "",
);

/**
 * The reader's language, as far as the REQUEST says.
 *
 * WHY THIS EXISTS HERE AND NOT IN THE DICTIONARY. The product's locale is a
 * client-side preference (`localStorage`, and then the `lang` attribute the
 * bootstrap writes on `<html>`), and a server component cannot read either. A
 * server `generateMetadata` — the story layout's — therefore has exactly one
 * server-side signal about the reader's language: the `Accept-Language`
 * request header. It is a signal, not the truth: a reader whose browser is set
 * to English and whose stored preference is Arabic gets the English metadata
 * on a shared link and the Arabic page behind it. That is the best a server
 * can do, and it is better than pinning the locale to Arabic for everybody.
 *
 * WHY THE HEADER IS PARSED RATHER THAN SEARCHED. `Accept-Language` is a
 * WEIGHTED LIST, not a single value: `en-GB,en;q=0.9,ar;q=0.8` says English
 * first and Arabic second, and a substring test for "en" would take the
 * wrong answer out of `en-GB,ar;q=0.9,en;q=0.8` as often as not. The list is
 * therefore read as a list: each entry is a tag with a quality, the entries are
 * ordered by that quality, and the first entry whose primary language the
 * product speaks wins.
 *
 * A QUALITY OF ZERO IS A REFUSAL, and `*` is not a language: both are skipped,
 * because a browser that says "I accept anything, except Arabic" must not be
 * given Arabic.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const candidates = header
    .split(",")
    .map((entry) => {
      const [rawTag, ...parameters] = entry.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      const parsed = quality ? Number.parseFloat(quality.slice(2)) : 1;
      return {
        tag: rawTag.trim().toLowerCase(),
        // A quality that is not a number is not a preference, so it is treated
        // as no preference at all rather than as the highest one.
        quality: Number.isFinite(parsed) ? parsed : 0,
      };
    })
    .filter((candidate) => candidate.tag.length > 0 && candidate.quality > 0)
    // A stable sort keeps the header's own order between two entries of the
    // same quality, which is what the header means by listing them in that
    // order.
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    // `en-GB` and `en-US` are both English; the region is not a language the
    // product distinguishes, so only the primary subtag is looked at.
    const primary = candidate.tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}
