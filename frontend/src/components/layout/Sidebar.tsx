"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useStrings } from "@/components/providers/LocaleProvider";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * The primary navigation: the start column of §5, 240px, visible from `lg`.
 *
 * Two decisions that are easy to get wrong:
 *
 * - **`aria-current="page"` on the active item, not a colour alone.** Colour is
 *   the only thing a screen-reader user cannot use to know where they are.
 * - **Exact match for the home route.** `/` is a prefix of everything, so the
 *   generic `startsWith` test marks the dashboard as active on every single
 *   page. Home therefore matches only itself.
 *
 * The column is sticky under the header rather than full-height, so the nav
 * follows a long feed instead of scrolling away with the page.
 */
export function Sidebar() {
  const pathname = usePathname();
  const strings = useStrings();

  const primary: NavItem[] = [
    { href: AUTHENTICATED_HOME_ROUTE, label: strings.navHome, icon: "home" },
    { href: "/stories", label: strings.navStories, icon: "pen" },
    { href: "/books", label: strings.navBooks, icon: "library" },
    { href: "/library", label: strings.navLibrary, icon: "book" },
    { href: "/contests", label: strings.navContests, icon: "trophy" },
  ];

  const secondary: NavItem[] = [
    { href: "/messages", label: strings.navMessages, icon: "message" },
    { href: "/notifications", label: strings.navNotifications, icon: "bell" },
    { href: "/rentals", label: strings.navRentals, icon: "clock" },
    { href: "/payments", label: strings.navPayments, icon: "wallet" },
  ];

  const isActive = (href: string) =>
    href === AUTHENTICATED_HOME_ROUTE ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-e border-line bg-surface/40 lg:block">
      <div className="flex h-full flex-col gap-6 p-4">
        <Brand href={AUTHENTICATED_HOME_ROUTE} size="sm" />

        <ButtonLink href="/stories/create" variant="primary" block>
          <Icon name="pen" size="sm" />
          {strings.createStory}
        </ButtonLink>

        <Nav items={primary} isActive={isActive} label={strings.mainNavigation} />
        <Nav items={secondary} isActive={isActive} label={strings.secondaryNavigation} />

        <div className="mt-auto pt-4">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}

function Nav({
  items,
  isActive,
  label,
}: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "bg-accent-soft text-accent-ink"
                    : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                }`}
              >
                <Icon name={item.icon} size="sm" className={active ? "text-accent" : undefined} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
