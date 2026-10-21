import type { MetadataRoute } from "next";

import { stringsFor } from "@/lib/i18n";

/**
 * The web app manifest — what makes the product installable and what gives a
 * phone a name and a colour for the shortcut.
 *
 * WHY IT EXISTS. A reading product is read on a phone, and a phone browser
 * offers to install a site as an app — but only when the site says what that
 * app is. Without this file the "add to home screen" prompt either does not
 * appear or appears with a screenshot of the site and a URL as its name.
 *
 * The colours are the product's own: the obsidian canvas and the amber accent
 * are the two colours the theme is built from, and they are declared in
 * `globals.css` — the same values, so the installed app opens on the surface
 * the reader chose.
 */
export default function manifest(): MetadataRoute.Manifest {
  const { shell } = stringsFor("ar");

  /*
   * WHY THE MANIFEST IS IN ARABIC WHILE THE APP HAS A LANGUAGE SWITCH.
   *
   * `lang` and `dir` are HINTS FOR THE USER AGENT — they tell a launcher what
   * language the installed app is in and which way its icon points — and the
   * manifest is a static file: the reader's preference is a client-side fact
   * that the file cannot know.
   *
   * The default locale is therefore the honest answer, and the product's
   * default is Arabic. It is also the answer that is RIGHT most of the time:
   * the app itself sets `lang` and `dir` on `<html>` from the reader's
   * preference before the first paint (see `lib/preferences.ts`), so the
   * INSTALLED app renders in the reader's language whatever the manifest says.
   * The manifest only decides what a launcher prints on the icon.
   */
  return {
    name: shell.appTitle,
    short_name: shell.brand,
    description: shell.appDescription,
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0D0B0A",
    theme_color: "#0D0B0A",
    categories: ["books", "education", "entertainment"],
    icons: [
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
