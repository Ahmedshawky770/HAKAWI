"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { DEFAULT_THEME, isTheme, THEME_STORAGE_KEY, themeFromSystem, type Theme } from "@/lib/preferences";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The theme lives on `<html data-theme>`, and that element is the single source
 * of truth: the inline bootstrap in the document head resolves the stored
 * preference before the first paint, and every colour token in `globals.css` is
 * keyed off that attribute.
 *
 * WHICH MEANS THE PROVIDER IS A SUBSCRIBER, NOT A SECOND COPY. `useState` plus
 * an effect would keep a copy in React that could disagree with the DOM (and
 * would trip `react-hooks/set-state-in-effect`); `useSyncExternalStore` reads the
 * attribute on demand, re-renders when it changes, and — because
 * `getServerSnapshot` returns the documented default — hydrates without a
 * mismatch warning even when the reader prefers light.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const attribute = document.documentElement.getAttribute("data-theme");
  return isTheme(attribute) ? attribute : themeFromSystem();
}

function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

function applyTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  window.localStorage.setItem(THEME_STORAGE_KEY, next);
  emit();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");

    const onSystemChange = (event: MediaQueryListEvent) => {
      // An explicit choice always beats the system: the toggle is the reader's,
      // and flipping it back to "follow the system" is what clearing the stored
      // preference would mean.
      if (window.localStorage.getItem(THEME_STORAGE_KEY)) return;
      document.documentElement.setAttribute("data-theme", event.matches ? "light" : "dark");
      emit();
    };

    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const setTheme = useCallback((next: Theme) => applyTheme(next), []);
  const toggleTheme = useCallback(
    () => applyTheme(getSnapshot() === "dark" ? "light" : "dark"),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}
