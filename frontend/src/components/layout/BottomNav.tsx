"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Icon, type IconName } from "@/components/ui/Icon";

const ITEMS: { href: string; icon: IconName; key: keyof ReturnType<typeof useStrings> }[] = [
  { href: AUTHENTICATED_HOME_ROUTE, icon: "home", key: "navHome" },
  { href: "/stories", icon: "pen", key: "navStories" },
  { href: "/library", icon: "book", key: "navLibrary" },
  { href: "/messages", icon: "message", key: "navMessages" },
  { href: "/profile", icon: "user", key: "navProfile" },
];

/**
 * The mobile navigation bar: five destinations, `lg:hidden`.
 *
 * Five is the ceiling. A bar with more than five items forces 44px targets to
 * shrink below the touch minimum on a 320px screen, and there is no honest way
 * to shrink an icon further. Anything else stays reachable from the feed itself.
 *
 * Every target is at least 44×44px including the label, and the active item is
 * marked with `aria-current` plus the accent — the same "never colour alone"
 * rule the sidebar follows.
 */
export function BottomNav() {
  const pathname = usePathname();
  const strings = useStrings();

  const isActive = (href: string) =>
    href === AUTHENTICATED_HOME_ROUTE ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={strings.mainNavigation}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          const label = strings[item.key];
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors duration-200 ${
                  active ? "text-accent-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon name={item.icon} size="md" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
