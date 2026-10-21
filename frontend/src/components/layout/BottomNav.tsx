"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { useUnreadMessageCount } from "@/lib/queries";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { UnreadBadge } from "./UnreadBadge";

const ITEMS: { href: string; icon: IconName; key: keyof ReturnType<typeof useStrings>["shell"] }[] = [
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
  const unreadMessages = useUnreadMessageCount();

  const isActive = (href: string) =>
    href === AUTHENTICATED_HOME_ROUTE ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      // Its own label, not the sidebar's: both landmarks are in the DOM on every
      // route (only `display: none` separates them at a breakpoint), and two
      // `navigation` landmarks that resolve to one accessible name are
      // indistinguishable to a screen reader — the rule `TrendingRail` states
      // for the rail. The bar is the phone's navigation, so it says so.
      aria-label={strings.shell.bottomNavigation}
      // `pb-[env(safe-area-inset-bottom)]`: on a phone with a home indicator
      // the bar's own bottom edge is under the system bar, and the last row of
      // items sat exactly where the reader's thumb swipes to go home. The
      // padding is the inset, so the items keep their 44px and the bar grows
      // by the height of the indicator rather than covering it. `env()` is
      // zero on every device without an inset, so nothing else moves.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          const label = strings.shell[item.key];
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors duration-200 ${
                  active ? "text-accent-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <span className="relative flex size-5 items-center justify-center">
                  <Icon name={item.icon} size="md" />
                  {item.href === "/messages" && (
                    <UnreadBadge count={unreadMessages} label={strings.shell.unreadMessagesLabel} />
                  )}
                </span>
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
