import React from "react";

import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { TrendingRail } from "./TrendingRail";

/**
 * The application frame of §5, in one place.
 *
 * ```
 *   ≥1024px (lg)                      <1024px
 *   ┌──────────────────────────────┐  ┌──────────────────────┐
 *   │ header  h-14 (sticky)        │  │ header  h-14         │
 *   ├────────┬───────────┬─────────┤  ├──────────────────────┤
 *   │ start  │ middle    │ end     │  │                      │
 *   │ 240px  │ max-w-2xl │ 280px   │  │ middle, full width   │
 *   │ nav    │ the feed  │ trending│  │                      │
 *   └────────┴───────────┴─────────┘  ├──────────────────────┤
 *                                       │ bottom nav (5 items)│
 *                                       └──────────────────────┘
 * ```
 *
 * Three rules, and each of them is a decision rather than a default:
 *
 * - **The middle column is the only one that scrolls.** The sidebars are
 *   `sticky` under the header. A navigation rail that scrolls out of reach is a
 *   navigation rail nobody uses on a long feed.
 * - **`max-w-2xl` (672px) on the feed.** The type scale asks for a 65ch measure
 *   and Arabic at 18px needs it; a 1400px-wide column of prose is unreadable
 *   whatever the font.
 * - **`xl` for the trending rail, `lg` for the nav column.** At 1024–1279px,
 *   240px of nav plus a 672px feed plus a 280px rail is 1192px of fixed chrome in
 *   a 1024px viewport. The rail is the first thing to go, because the feed and
 *   the nav are the two things a reader cannot do without.
 *
 * The bottom padding reserves the height of the mobile bar, so the last card in
 * a feed is never hidden underneath it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Header />
      <div className="mx-auto flex w-full max-w-7xl flex-1 items-start gap-0">
        <Sidebar />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-10"
        >
          {children}
        </main>
        <TrendingRail />
      </div>
      <BottomNav />
    </div>
  );
}
