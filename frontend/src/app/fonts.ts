import { Cairo, IBM_Plex_Sans_Arabic, Inter, Amiri } from "next/font/google";

/**
 * The four faces named by the design system, loaded once and exposed as CSS
 * variables.
 *
 * WHY VARIABLES AND NOT FAMILIES. `@theme inline` in `globals.css` maps
 * `--font-arabic-heading` to these, so a component asks for `font-arabic-body`
 * and never names a typeface. That is what lets §2 of the design system — one
 * table of four families — actually govern the product.
 *
 * `display: "swap"` is the design system's font strategy: text is readable in
 * the fallback immediately, which beats a blank page while Arabic webfonts
 * download.
 *
 * WHY EVERY FACE DECLARES `preload: false`. `next/font` emits a
 * `<link rel="preload" as="font">` for EVERY FILE of a face it is told to
 * preload — every weight, of every subset the face was asked for. These four
 * faces are FIFTEEN files between them: Amiri contributes four (two weights, in
 * the Arabic and the Latin subset), Cairo two (it is a variable face, so one
 * file per subset), IBM Plex Sans Arabic eight (four weights, in two subsets),
 * and Inter one (Latin, variable). The browser then downloads all fifteen on a
 * page that uses three or four of them, and every file it does not end up using
 * is a file the console reports as "preloaded with link preload … was not used
 * within a few seconds".
 *
 * The preloads were not a speculative win either, because the faces are a
 * FALLBACK CHAIN: `--font-arabic-heading` is Amiri and then Cairo, so Cairo is
 * only ever drawn when Amiri fails to load, and it never does. Cairo was being
 * preloaded on every page and used on none. With the preload off, the browser
 * fetches a face when a rule actually asks for it, which is the same set of
 * files the page was going to use anyway — fewer bytes, and no console noise.
 *
 * THE COST, STATED PLAINLY. A face is discovered when the stylesheet that
 * carries its `@font-face` is parsed rather than in parallel with it, so the
 * webfont arrives about one round trip later than a preload would have it.
 * `display: "swap"` and Next's automatic fallback metrics (`adjustFontFallback`,
 * on by default) keep the text readable and the layout stable while it arrives,
 * which is the trade the design system's font strategy already makes.
 *
 * ⚠️ `subsets` IS INERT WHILE `preload` IS false, and it is kept anyway.
 * `next/font` uses `subsets` for exactly one thing: choosing which of the files
 * it downloaded get a preload link. With the preload off there is nothing to
 * choose, so the option does nothing at all — and it is kept because it records
 * which subsets the product is written in, and because turning `preload` back on
 * without it is a build error `next/font` raises on purpose ("Preload is enabled
 * but no subsets were specified"). Every subset's `@font-face` is emitted either
 * way: `next/font` downloads the whole Google Fonts stylesheet, and `subsets`
 * never narrowed what shipped.
 */
const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
  preload: false,
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
  preload: false,
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
  preload: false,
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

/**
 * The class list every layout mounts. One export so a page that renders a bare
 * `<html>` (tests, the OAuth callback) cannot forget a face.
 */
export const designFonts = `${amiri.variable} ${cairo.variable} ${ibmPlexSansArabic.variable} ${inter.variable}`;
