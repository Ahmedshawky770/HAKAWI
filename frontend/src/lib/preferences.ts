/**
 * Theme and locale: the two preferences that change the document itself, not
 * just the components inside it.
 *
 * WHY A BOOTSTRAP SCRIPT INSTEAD OF AN EFFECT. `data-theme` decides every
 * background and text colour in the product (see `globals.css`). Setting it
 * from a React effect would paint the dark default first and then repaint the
 * light theme for every light-mode reader — a flash that reads as a bug. The
 * bootstrap runs inline in `<head>`, before the first paint, and the React
 * providers below only take over afterwards to keep the UI in sync.
 */

export const THEME_STORAGE_KEY = "hakawi.theme";
export const LOCALE_STORAGE_KEY = "hakawi.locale";

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Arabic is right-to-left; English is left-to-right. */
export function directionFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function themeFromSystem(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function localeFromSystem(): Locale {
  return DEFAULT_LOCALE;
}

/**
 * The inline bootstrap, inlined into `<head>`.
 *
 * Kept as a string with no dependencies so it can run before any bundle has
 * loaded, and kept defensive: a browser that throws on `localStorage`
 * (private mode, blocked cookies) still resolves to the documented defaults
 * instead of rendering an unstyled document.
 */
export const PREFERENCE_BOOTSTRAP_SCRIPT = `(function(){try{
var root=document.documentElement;
var theme=null;
try{theme=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}
if(theme!=="dark"&&theme!=="light"){theme=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}
root.setAttribute("data-theme",theme);
var locale=null;
try{locale=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});}catch(e){}
if(locale!=="ar"&&locale!=="en"){locale=${JSON.stringify(DEFAULT_LOCALE)};}
root.setAttribute("lang",locale);
root.setAttribute("dir",locale==="ar"?"rtl":"ltr");
}catch(e){}})();`;
