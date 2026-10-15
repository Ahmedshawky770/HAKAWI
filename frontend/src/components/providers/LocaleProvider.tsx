"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { intlLocale, stringsFor, type AppStrings } from "@/lib/i18n";
import {
  DEFAULT_LOCALE,
  directionFor,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "@/lib/preferences";

interface LocaleContextValue {
  locale: Locale;
  direction: "rtl" | "ltr";
  strings: AppStrings;
  /** `ar-EG` or `en-GB`, for `Intl` and the date helpers in `lib/i18n`. */
  intl: string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * `<html lang>` and `<html dir>` are the same situation as the theme: the
 * bootstrap script resolves them before paint, and the whole layout mirrors from
 * `dir`. So the provider subscribes to the document rather than keeping a copy
 * of the locale in state — `dir` on `<html>` is the only thing that flips the
 * layout, and a React-side copy could disagree with it.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const attribute = document.documentElement.getAttribute("lang");
  return isLocale(attribute) ? attribute : DEFAULT_LOCALE;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((next: Locale) => {
    const root = document.documentElement;
    root.setAttribute("lang", next);
    root.setAttribute("dir", directionFor(next));
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    emit();
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(getSnapshot() === "ar" ? "en" : "ar");
  }, [setLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: directionFor(locale),
      strings: stringsFor(locale),
      intl: intlLocale(locale),
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  // The document title and description meta are mirrored by `TitleMirror`, a
  // sibling component the root layout renders. It is deliberately NOT an effect
  // here: it has to subscribe to the route (Next re-applies the root layout's
  // static Arabic title on every route commit), and a hook that reaches 23
  // mocked `next/navigation` suites is the wrong price for a `<title>`. See the
  // header of `TitleMirror.tsx` for the whole argument.
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return context;
}

/**
 * The strings alone, for the components that need copy and nothing else.
 *
 * The same dictionary object `useLocale().strings` returns — the split is
 * ergonomic, not a second source: one dictionary instance per locale, two ways
 * to reach it, and a component that also needs `direction` or `intl` reaches
 * for the wider hook instead.
 */
export function useStrings(): AppStrings {
  return useLocale().strings;
}
