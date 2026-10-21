"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Brand } from "./Brand";
import { UnreadBadge } from "./UnreadBadge";
import { IconButton } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useUnreadNotificationCount } from "@/lib/queries";
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
 * - the notifications bell, with the unread count on it
 * - the profile link, which is the only place a reader can reach their own page
 *
 * The header reads exactly ONE fact — the unread notification count — and it
 * reads it from the shared cache, so the header, the sidebar and the
 * notifications page agree on the number without three requests. The badge is
 * positioned over the bell rather than sitting in the flow, so the header's
 * height does not change when the count arrives: a header that reflows pushes
 * the content under the reader's thumb.
 */
export function Header() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { locale, toggleLocale, strings } = useLocale();
  const unreadNotifications = useUnreadNotificationCount().data?.count ?? 0;

  const nextThemeLabel = theme === "dark" ? strings.shell.themeToLight : strings.shell.themeToDark;

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Brand href="/" size="sm" className="lg:hidden" />

        {/* A REAL FORM, so search works with JavaScript switched off. The submit
            handler intercepts it for the client-side transition the rest of the app
            uses; remove the handler and the form still submits to `/search`. */}
        <form
          action="/search"
          method="get"
          role="search"
          className="relative flex-1 max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new FormData(event.currentTarget).get("q");
            const term = typeof query === "string" ? query.trim() : "";
            if (!term) return;
            router.push(`/search?q=${encodeURIComponent(term)}`);
          }}
        >
          <label htmlFor="header-search" className="sr-only">
            {strings.shell.searchLabel}
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
            placeholder={strings.shell.searchPlaceholder}
            className="h-10 w-full rounded-lg border border-line bg-surface-raised ps-9 pe-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong focus:border-chrome"
          />
        </form>

        <div className="ms-auto flex items-center gap-1">
          <IconButton
            label={`${strings.shell.themeLabel}: ${nextThemeLabel}`}
            name={theme === "dark" ? "sun" : "moon"}
            onClick={toggleTheme}
          />
          <IconButton
            label={`${strings.shell.languageLabel}: ${locale === "ar" ? strings.shell.languageEnglish : strings.shell.languageArabic}`}
            name="globe"
            onClick={toggleLocale}
          />
          <Link
            href="/notifications"
            // The name carries the count, because an `aria-label` on the link
            // OVERRIDES its content: without the count in the label, the badge
            // beside the bell would be visible and never announced.
            aria-label={
              unreadNotifications > 0
                ? `${strings.shell.navNotifications} (${unreadNotifications})`
                : strings.shell.navNotifications
            }
            className="relative ms-1 flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink"
          >
            <Icon name="bell" size="md" />
            <UnreadBadge
              count={unreadNotifications}
              label={strings.shell.unreadNotificationsLabel}
            />
          </Link>
          <Link
            href="/profile"
            className="ms-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink"
          >
            {strings.shell.navProfile}
          </Link>
        </div>
      </div>
    </header>
  );
}
