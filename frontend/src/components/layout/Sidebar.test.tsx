/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { Sidebar } from "@/components/layout/Sidebar";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const pathnameMock = vi.fn<() => string>();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => router,
}));

const PRIMARY_LABELS = ["الرئيسية", "القصص", "الكتب", "مكتبتي", "المسابقات"];
const SECONDARY_LABELS = ["الرسائل", "الإشعارات", "الإيجارات", "المدفوعات"];

/** The start column renders two labelled navigation landmarks, not one. */
function navs(): HTMLElement[] {
  return screen.getAllByRole("navigation") as HTMLElement[];
}

function mainNav(): HTMLElement {
  return navs()[0];
}

function secondaryNav(): HTMLElement {
  return navs()[1];
}

describe("Sidebar", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/");
  });

  it("renders one link per navigation destination", () => {
    renderWithProviders(<Sidebar />);
    for (const label of [...PRIMARY_LABELS, ...SECONDARY_LABELS]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("labels each navigation landmark separately", () => {
    renderWithProviders(<Sidebar />);
    expect(mainNav()).toHaveAttribute("aria-label", "التنقل الرئيسي");
    expect(secondaryNav()).toHaveAttribute("aria-label", "روابط جانبية");
    expect(mainNav().querySelectorAll("a")).toHaveLength(PRIMARY_LABELS.length);
    expect(secondaryNav().querySelectorAll("a")).toHaveLength(SECONDARY_LABELS.length);
  });

  it("exposes the complementary landmark that wraps the navigation", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("complementary")).toContainElement(mainNav());
  });

  it("links each destination to its route", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "القصص" })).toHaveAttribute("href", "/stories");
    expect(screen.getByRole("link", { name: "مكتبتي" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "الإشعارات" })).toHaveAttribute("href", "/notifications");
  });

  it("brands the sidebar with a link back to the authenticated home", () => {
    renderWithProviders(<Sidebar />);
    const brand = screen.getByRole("link", { name: /حكاوي/ });
    expect(brand).toHaveAttribute("href", "/");
  });

  it("offers the primary writing action above the navigation", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "اكتب قصة" })).toHaveAttribute("href", "/stories/create");
  });

  it("marks the authenticated home as the current page", () => {
    pathnameMock.mockReturnValue("/");
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "الرئيسية" })).toHaveAttribute("aria-current", "page");
  });

  it("does not link any destination to the removed dashboard route", () => {
    renderWithProviders(<Sidebar />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/dashboard");
  });

  it("does not mark the authenticated home as current on any other route", () => {
    pathnameMock.mockReturnValue("/profile");
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "الرئيسية" })).not.toHaveAttribute("aria-current");
  });

  it("keeps a section active on its nested routes", () => {
    pathnameMock.mockReturnValue("/stories/abc/comments");
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "القصص" })).toHaveAttribute("aria-current", "page");
  });

  it("marks exactly one destination as the current page", () => {
    pathnameMock.mockReturnValue("/library/book-1");
    renderWithProviders(<Sidebar />);
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("مكتبتي");
  });

  it("marks nothing as current on an unrelated route", () => {
    pathnameMock.mockReturnValue("/search");
    renderWithProviders(<Sidebar />);
    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });

  it("does not treat a shared prefix as the active section", () => {
    pathnameMock.mockReturnValue("/booksellers");
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("link", { name: "الكتب" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the active destination apart from the inactive ones by token, not by colour alone", () => {
    pathnameMock.mockReturnValue("/payments");
    renderWithProviders(<Sidebar />);

    expect(screen.getByRole("link", { name: "المدفوعات" }).className).toContain("bg-accent-soft");
    expect(screen.getByRole("link", { name: "القصص" }).className).toContain("text-ink-muted");
  });

  it("renders a sign out control", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole("button", { name: "تسجيل الخروج" })).toBeInTheDocument();
  });

  it("keeps the sign out control outside both navigation landmarks", () => {
    renderWithProviders(<Sidebar />);
    for (const nav of navs()) {
      expect(nav.querySelectorAll("button")).toHaveLength(0);
    }
    expect(screen.getByRole("complementary")).toContainElement(
      screen.getByRole("button", { name: "تسجيل الخروج" }),
    );
  });

  it("renders the same destinations for a signed out visitor", () => {
    window.localStorage.removeItem("hakawi_user");
    renderWithProviders(<Sidebar />);
    // Brand, the write CTA, and the nine destinations.
    expect(screen.getAllByRole("link")).toHaveLength(PRIMARY_LABELS.length + SECONDARY_LABELS.length + 2);
  });
});
