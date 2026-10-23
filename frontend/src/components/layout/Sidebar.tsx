"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { useUnreadMessageCount, useUnreadNotificationCount } from "@/lib/queries";
import { useStoredUser } from "@/lib/use-stored-user";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";
import { UnreadBadge } from "./UnreadBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useStrings } from "@/components/providers/LocaleProvider";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  badgeLabel?: string;
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
 *
 * **Admin navigation:** a third nav block appears only for callers whose
 * `accountType === "admin"` and whose `adminRole` is one of the four admin
 * roles. Each item points to its own surface, and every surface is guarded by
 * `AdminGuard` so a caller who reaches a page they do not own is stopped with
 * a "wrong role" screen rather than data they cannot touch. The guard is UX;
 * the backend's `@Secured` + `@RequireAdminRole` decorators are the real
 * boundary.
 */
export function Sidebar() {
  const pathname = usePathname();
  const strings = useStrings();
  const unreadNotifications = useUnreadNotificationCount().data?.count ?? 0;
  const unreadMessages = useUnreadMessageCount();
  const user = useStoredUser();

  const isAdmin = user?.accountType === "admin" && typeof user.adminRole === "string";

  const primary: NavItem[] = [
    { href: AUTHENTICATED_HOME_ROUTE, label: strings.shell.navHome, icon: "home" },
    { href: "/stories", label: strings.shell.navStories, icon: "pen" },
    { href: "/books", label: strings.shell.navBooks, icon: "library" },
    { href: "/library", label: strings.shell.navLibrary, icon: "book" },
    { href: "/contests", label: strings.shell.navContests, icon: "trophy" },
  ];

  const secondary: NavItem[] = [
    {
      href: "/messages",
      label: strings.shell.navMessages,
      icon: "message",
      badge: unreadMessages,
      badgeLabel: strings.shell.unreadMessagesLabel,
    },
    {
      href: "/notifications",
      label: strings.shell.navNotifications,
      icon: "bell",
      badge: unreadNotifications,
      badgeLabel: strings.shell.unreadNotificationsLabel,
    },
    { href: "/rentals", label: strings.shell.navRentals, icon: "clock" },
    { href: "/payments", label: strings.shell.navPayments, icon: "wallet" },
  ];

  const admin: NavItem[] = [
    { href: "/admin", label: strings.shell.navAdmin, icon: "user" },
    { href: "/admin/moderation", label: strings.admin?.moderation?.pageTitle ?? "Content moderation", icon: "comment" },
    { href: "/admin/financial", label: strings.admin?.financial?.pageTitle ?? "Financial", icon: "wallet" },
    { href: "/admin/verification", label: strings.admin?.verification?.pageTitle ?? "Identity verification", icon: "user" },
    { href: "/admin/roles", label: strings.admin?.roles?.pageTitle ?? "Role management", icon: "users" },
  ];

  const isActive = (href: string) =>
    href === AUTHENTICATED_HOME_ROUTE ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-e border-line bg-surface/40 lg:block">
      <div className="flex h-full flex-col gap-6 p-4">
        <Brand href={AUTHENTICATED_HOME_ROUTE} size="sm" />

        <ButtonLink href="/stories/create" variant="primary" block>
          <Icon name="pen" size="sm" />
          {strings.shell.createStory}
        </ButtonLink>

        <Nav items={primary} isActive={isActive} label={strings.shell.mainNavigation} />
        <Nav items={secondary} isActive={isActive} label={strings.shell.secondaryNavigation} />

        {isAdmin && (
          <Nav items={admin} isActive={isActive} label={strings.shell.navAdmin} />
        )}

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
                <span className="relative flex size-5 items-center justify-center">
                  <Icon name={item.icon} size="sm" className={active ? "text-accent" : undefined} />
                  {item.badge !== undefined && (
                    <UnreadBadge count={item.badge} label={item.badgeLabel ?? item.label} />
                  )}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
