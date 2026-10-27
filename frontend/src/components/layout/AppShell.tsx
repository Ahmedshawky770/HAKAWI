import React from "react";

import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { TrendingRail } from "./TrendingRail";

/**
 * The application frame of §5, in one place.
 *
 * ```
 *   ≥1280px (xl)                       1024–1279px (lg)                  <1024px
 *   ┌──────────────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
 *   │ header  h-14 (sticky)        │   │ header  h-14         │   │ header  h-14     │
 *   ├────────┬───────────┬─────────┤   ├────────┬────────────┤   ├──────────────────┤
 *   │ start  │ middle    │ end     │   │ start  │ middle     │   │ middle, full     │
 *   │ 240px  │ fluid     │ 280px   │   │ 240px  │ fluid      │   │ width, fluid     │
 *   │ nav    │ px-6..8   │ trending│   │ nav    │ px-6..8    │   │ px-6             │
 *   └────────┴───────────┴─────────┘   ├────────┴────────────┤   ├──────────────────┤
 *                                       │ bottom nav (5 items) │   │ bottom nav       │
 *                                       └────────────────────┘   └──────────────────┘
 * ```
 *
 * Three rules, and each of them is a decision rather than a default:
 *
 * - **The middle column is the only one that scrolls.** The sidebars are
 *   `sticky` under the header. A navigation rail that scrolls out of reach is a
 *   navigation rail nobody uses on a long feed.
 * - **The main column is fluid.** `max-w-2xl` is removed; the feed expands
 *   across the available width with `px-6 md:px-8` padding so content cards
 *   fill the screen on desktop while keeping breathing space near the
 *   sidebars. Content inside the main column (story cards, grids) is
 *   responsible for its own columnar constraints via `grid-cols-*`.
 * - **`xl` for the trending rail, `lg` for the nav column.** At 1024–1279px,
 *   240px of nav plus a fluid feed is already wide enough; the rail is the
 *   first thing to go, because the feed and the nav are the two things a
 *   reader cannot do without.
 *
 * The bottom padding reserves the height of the mobile bar, so the last card in
 * a feed is never hidden underneath it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Header />
      <div className="flex w-full flex-1 gap-0">
        <Sidebar />
        <main
          id="main-content"
          tabIndex={-1}
          className="w-full flex-1 min-w-0 px-6 md:px-8 pt-6 pb-24 lg:pb-10"
        >
          {children}
        </main>
        <TrendingRail />
      </div>
      <BottomNav />
    </div>
  );
}
