/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
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

const NAV_LABELS = [
  "Dashboard",
  "Stories",
  "Books",
  "My Library",
  "Contests",
  "Messages",
  "Notifications",
  "Payments",
  "Rentals",
];

describe("Sidebar", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/");
  });

  it("renders one link per navigation destination", () => {
    render(<Sidebar />);
    for (const label of NAV_LABELS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the navigation inside a nav landmark", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation");
    expect(nav.querySelectorAll("a")).toHaveLength(NAV_LABELS.length);
  });

  it("exposes the complementary landmark that wraps the navigation", () => {
    render(<Sidebar />);
    expect(screen.getByRole("complementary")).toContainElement(screen.getByRole("navigation"));
  });

  it("links each destination to its route", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute("href", "/stories");
    expect(screen.getByRole("link", { name: "My Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/notifications");
  });

  it("brands the sidebar with a link back to the authenticated home", () => {
    render(<Sidebar />);
    const brand = screen.getByRole("link", { name: /Hakawi/ });
    expect(brand).toHaveAttribute("href", "/");
  });

  it("marks the authenticated home as the current page", () => {
    pathnameMock.mockReturnValue("/");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("does not link any destination to the removed dashboard route", () => {
    render(<Sidebar />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/dashboard");
  });

  it("does not mark the authenticated home as current on any other route", () => {
    pathnameMock.mockReturnValue("/profile");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");
  });

  it("keeps a section active on its nested routes", () => {
    pathnameMock.mockReturnValue("/stories/abc/comments");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Stories" })).toHaveAttribute("aria-current", "page");
  });

  it("marks exactly one destination as the current page", () => {
    pathnameMock.mockReturnValue("/library/book-1");
    render(<Sidebar />);
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("My Library");
  });

  it("marks nothing as current on an unrelated route", () => {
    pathnameMock.mockReturnValue("/search");
    render(<Sidebar />);
    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });

  it("does not treat a shared prefix as the active section", () => {
    pathnameMock.mockReturnValue("/booksellers");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Books" })).not.toHaveAttribute("aria-current", "page");
  });

  it("renders the same destinations for a signed out visitor", () => {
    window.localStorage.removeItem("hakawi_user");
    render(<Sidebar />);
    expect(screen.getAllByRole("link")).toHaveLength(NAV_LABELS.length + 1);
  });

  it("renders the same destinations for a signed in user", () => {
    window.localStorage.setItem("hakawi_user", JSON.stringify({ id: "u1", email: "a@b.c", name: "أحمد" }));
    render(<Sidebar />);
    expect(screen.getAllByRole("link")).toHaveLength(NAV_LABELS.length + 1);
  });

  it("keeps the active destination styled apart from the inactive ones", () => {
    pathnameMock.mockReturnValue("/payments");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Payments" }).className).toContain("bg-blue-50");
    expect(screen.getByRole("link", { name: "Stories" }).className).toContain("text-gray-700");
  });

  it("renders a sign out control", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "تسجيل الخروج" })).toBeInTheDocument();
  });

  it("keeps the sign out control outside the navigation landmark", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation");
    expect(nav.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByRole("complementary")).toContainElement(screen.getByRole("button", { name: "تسجيل الخروج" }));
  });
});
