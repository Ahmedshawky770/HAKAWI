"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { intlLocale, shellStrings, type ShellStrings } from "@/lib/i18n";
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
  strings: ShellStrings;
  /** `ar-EG` or `en-GB`, for `Intl` and `toLocaleDateString`. */
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
      strings: shellStrings(locale),
      intl: intlLocale(locale),
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return context;
}

/** Shell copy for the active locale. */
export function useStrings(): ShellStrings {
  return useLocale().strings;
}
