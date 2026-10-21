"use client";

import React, { useEffect } from "react";

import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE, directionFor, isLocale, type Locale } from "@/lib/preferences";

/**
 * The last boundary: the one that runs when the ROOT LAYOUT itself failed.
 *
 * WHY IT RENDERS ITS OWN `<html>`. A `global-error` replaces the root layout
 * entirely — the layout that mounts the providers, the fonts and the theme is
 * exactly what crashed. So this component cannot use `useStrings`, cannot use
 * the design system's components, and cannot rely on a stylesheet that the
 * layout would have loaded: it has to bring its own `<html>`, its own `<body>`
 * and its own styles.
 *
 * WHICH IS WHY IT IS PLAIN. Every class name here is inline, because the
 * Tailwind stylesheet is loaded by the layout that just crashed. The colours
 * are the product's obsidian and amber, written out: the first thing a reader
 * sees after a crash should still look like the product.
 *
 * BUT THE WORDS COME FROM THE DICTIONARY. The layout that crashed is the
 * layout that mounts the locale provider, so this screen cannot ASK the
 * provider for the reader's language — but the dictionary itself is a plain
 * module with no browser state in it, and it can be read directly. The copy is
 * therefore the same copy every other error screen shows, and editing the
 * dictionary edits this screen too.
 */

/**
 * The reader's language, read from the document rather than pinned.
 *
 * WHY NOT A CONSTANT. The provider is gone, but the DOCUMENT is not: the
 * bootstrap script in the root layout's `<head>` writes the stored locale onto
 * `<html lang>` before the first paint, and that attribute survives the crash
 * the root layout caused. A screen that pinned Arabic would greet an English
 * reader with an Arabic RTL crash page while every other error screen in the
 * product speaks their language.
 *
 * WHY IT IS READ WHILE RENDERING AND NOT IN AN EFFECT. The read happens
 * during the render, which is BEFORE React commits the new `<html>` — so it
 * sees the attribute the crashed page left behind, not the one this
 * component is about to write. An effect would run after the commit and read
 * back its own output.
 *
 * WHY THE SERVER GETS THE DEFAULT. There is no document on the server, so
 * the product's own language is the only answer available; the client's first
 * render then reads the same attribute the server rendered from, and the two
 * agree.
 */
function localeFromDocument(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const lang = document.documentElement.getAttribute("lang");
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const locale = localeFromDocument();
  const { common, shell } = stringsFor(locale);

  return (
    <html lang={locale} dir={directionFor(locale)}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D0B0A",
          color: "#EFEce6",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p style={{ color: "#FF9100", fontSize: "1rem", fontWeight: 700, margin: 0 }}>
            {shell.brand}
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "0.75rem 0 0.5rem" }}>{common.errorTitle}</h1>
          <p style={{ color: "#A8A49E", fontSize: "0.95rem", lineHeight: 1.8, margin: 0 }}>
            {common.errorDescription}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              minHeight: "2.75rem",
              padding: "0 1.5rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#FF9100",
              color: "#0D0B0A",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {common.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
