/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { jsonResponse } from "@/test-utils/support";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { TrendingRail } from "@/components/layout/TrendingRail";

vi.mock("next/link", () => ({ __esModule: true, default: AnchorLink }));

const pathnameMock = vi.fn<() => string>();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => router,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  pathnameMock.mockReturnValue("/");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(jsonResponse({ stories: [], total: 0, page: 1, limit: 20 }));
});

describe("AppShell", () => {
  it("gives the main region the id the skip link targets", () => {
    renderWithProviders(
      <AppShell>
        <p>المحتوى</p>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(main).toHaveTextContent("المحتوى");
  });

  it("caps the feed at the measure the type scale asks for", () => {
    renderWithProviders(<AppShell>المحتوى</AppShell>);
    expect(screen.getByRole("main").className).toContain("max-w-2xl");
  });

  it("reserves room for the mobile bar so the last card is never covered", () => {
    renderWithProviders(<AppShell>المحتوى</AppShell>);
    expect(screen.getByRole("main").className).toContain("pb-24");
  });

  it("mounts one header, both sidebars and the bottom bar", () => {
    renderWithProviders(<AppShell>المحتوى</AppShell>);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("complementary")).toHaveLength(2);
    expect(screen.getAllByRole("navigation").length).toBeGreaterThanOrEqual(3);
  });

  it("shows the end column only from xl, and the start column only from lg", () => {
    renderWithProviders(<AppShell>المحتوى</AppShell>);

    const [start, end] = screen.getAllByRole("complementary");
    expect(start.className).toContain("lg:block");
    expect(start.className).toContain("w-60");
    expect(end.className).toContain("xl:block");
    expect(end.className).toContain("w-70");
  });

  it("keeps both sidebars pinned under the sticky header", () => {
    renderWithProviders(<AppShell>المحتوى</AppShell>);
    for (const aside of screen.getAllByRole("complementary")) {
      expect(aside.className).toContain("sticky");
      expect(aside.className).toContain("top-14");
    }
  });
});

describe("Header", () => {
  it("offers search as a real form, so it works without JavaScript", () => {
    renderWithProviders(<Header />);

    const search = screen.getByRole("search");
    expect(search.tagName).toBe("FORM");
    expect(search).toHaveAttribute("action", "/search");
    expect(search).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("البحث في الحكاوي")).toHaveAttribute("name", "q");
  });

  it("switches the theme from the header", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderWithProviders(<Header />);

    await user.click(screen.getByRole("button", { name: /تبديل المظهر/ }));

    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("light"));
  });

  it("switches the language from the header", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderWithProviders(<Header />);

    await user.click(screen.getByRole("button", { name: /تبديل اللغة/ }));

    await waitFor(() => expect(document.documentElement.getAttribute("lang")).toBe("en"));
  });

  it("labels the theme toggle with the theme it switches to", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    renderWithProviders(<Header />);
    expect(screen.getByRole("button", { name: /الوضع الفاتح/ })).toBeInTheDocument();
  });

  it("reaches the reader's own profile", () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole("link", { name: "حسابي" })).toHaveAttribute("href", "/profile");
  });

  it("keeps the brand out of the way of the sidebar brand on desktop", () => {
    renderWithProviders(<Header />);
    const brand = screen.getAllByRole("link", { name: /حكاوي/ })[0];
    expect(brand.className).toContain("lg:hidden");
  });
});

describe("BottomNav", () => {
  it("offers exactly five destinations", () => {
    renderWithProviders(<BottomNav />);
    expect(screen.getByRole("navigation").querySelectorAll("a")).toHaveLength(5);
  });

  it("keeps every target at or above the 44px minimum", () => {
    renderWithProviders(<BottomNav />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-14");
    }
  });

  it("stays out of the way of the desktop navigation", () => {
    renderWithProviders(<BottomNav />);
    expect(screen.getByRole("navigation").className).toContain("lg:hidden");
  });

  it("marks the current destination for a screen reader, not only in colour", () => {
    pathnameMock.mockReturnValue("/library/book-1");
    renderWithProviders(<BottomNav />);

    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("مكتبتي");
  });
});

describe("TrendingRail", () => {
  it("ranks the recent page by reactions, the only ordering the API allows", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        stories: [
          { id: "s1", title: "الأقل تفاعلاً", slug: "a", excerpt: null, content: null, coverImage: null, status: "published", category: null, tags: [], views: 5, reactions: 3, author: { id: "u1", name: "أحمد" }, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "s2", title: "الأكثر تفاعلاً", slug: "b", excerpt: null, content: null, coverImage: null, status: "published", category: null, tags: [], views: 9, reactions: 90, author: { id: "u2", name: "سارة" }, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
        total: 2,
        page: 1,
        limit: 20,
      }),
    );

    renderWithProviders(<TrendingRail />);

    // Skeleton rows are aria-hidden, so only the loaded ranking matches.
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("الأكثر تفاعلاً");
    expect(items[1]).toHaveTextContent("الأقل تفاعلاً");
  });

  it("says so when there is nothing to rank", async () => {
    renderWithProviders(<TrendingRail />);
    expect(await screen.findByText("لا توجد قصص بعد.")).toBeInTheDocument();
  });

  it("offers the writing action above the ranking", () => {
    renderWithProviders(<TrendingRail />);
    const links = screen.getAllByRole("link", { name: "اكتب حكايتك هنا…" });
    expect(links[0]).toHaveAttribute("href", "/stories/create");
  });

  it("stays out of the way below xl", () => {
    renderWithProviders(<TrendingRail />);
    expect(screen.getByRole("complementary").className).toContain("xl:block");
  });
});
