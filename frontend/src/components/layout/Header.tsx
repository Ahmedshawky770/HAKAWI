"use client";

import React from "react";
import Link from "next/link";

import { Brand } from "./Brand";
import { IconButton } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Icon } from "@/components/ui/Icon";

/**
 * The sticky header of §5: `h-14`, always at the top, present on every
 * breakpoint.
 *
 * It owns exactly four things, and keeping the list short is the point — the
 * header is the only chrome that never scrolls away, so anything in it competes
 * with the content:
 *
 * - the brand (mobile only; from `lg` the sidebar carries it)
 * - search, the one global action
 * - the theme toggle (§14) and the language toggle (§15)
 * - the profile link, which is the only place a reader can reach their own page
 *
 * Nothing here fetches. A header that reflows when data arrives pushes the
 * content down and breaks the scroll position.
 */
export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { locale, toggleLocale, strings } = useLocale();

  const nextThemeLabel = theme === "dark" ? strings.themeToLight : strings.themeToDark;

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Brand href="/" size="sm" className="lg:hidden" />

        <form action="/search" method="get" role="search" className="relative flex-1 max-w-md">
          <label htmlFor="header-search" className="sr-only">
            {strings.searchLabel}
          </label>
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-faint"
          />
          <input
            id="header-search"
            name="q"
            type="search"
            placeholder={strings.searchPlaceholder}
            className="h-10 w-full rounded-lg border border-line bg-surface-raised ps-9 pe-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong focus:border-chrome"
          />
        </form>

        <div className="ms-auto flex items-center gap-1">
          <IconButton
            label={`${strings.themeLabel}: ${nextThemeLabel}`}
            name={theme === "dark" ? "sun" : "moon"}
            onClick={toggleTheme}
          />
          <IconButton
            label={`${strings.languageLabel}: ${locale === "ar" ? "English" : "العربية"}`}
            name="globe"
            onClick={toggleLocale}
          />
          <Link
            href="/profile"
            className="ms-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink"
          >
            {strings.navProfile}
          </Link>
        </div>
      </div>
    </header>
  );
}
