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
 */
const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * The class list every layout mounts. One export so a page that renders a bare
 * `<html>` (tests, the OAuth callback) cannot forget a face.
 */
export const designFonts = `${amiri.variable} ${cairo.variable} ${ibmPlexSansArabic.variable} ${inter.variable}`;
