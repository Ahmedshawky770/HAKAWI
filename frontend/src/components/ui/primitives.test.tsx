/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ListRowSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { StoryFeedSkeleton } from "@/components/story/StoryCard";
import { StatCard } from "@/components/ui/StatCard";

describe("Icon", () => {
  it("is decorative unless it is asked to speak", () => {
    const { container } = render(<Icon name="heart" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("becomes an image with a name when a glyph IS the label", () => {
    render(<Icon name="warning" title="تحذير" />);
    expect(screen.getByRole("img", { name: "تحذير" })).toBeInTheDocument();
  });

  it("mirrors the glyphs whose meaning depends on direction", () => {
    const { container: back } = render(<Icon name="chevron" />);
    expect(back.querySelector("svg")?.getAttribute("class")).toContain("hk-flip-rtl");

    const { container: heart } = render(<Icon name="heart" />);
    expect(heart.querySelector("svg")?.getAttribute("class")).not.toContain("hk-flip-rtl");
  });

  it("draws every glyph on the same 24px grid with the same stroke", () => {
    for (const name of ["home", "book", "trending", "wallet", "sparkle"] as IconName[]) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("stroke-width", "1.75");
      unmount();
    }
  });
});

describe("Avatar", () => {
  it("falls back to the initial, because a grey circle where a name should be is unreadable", () => {
    render(<Avatar name="أحمد محمد" />);
    expect(screen.getByText("أ")).toBeInTheDocument();
  });

  it("has something to show for a name that is only whitespace", () => {
    render(<Avatar name="   " />);
    expect(screen.getByText("؟")).toBeInTheDocument();
  });

  it("hides a decorative image, because the name is always adjacent", () => {
    const { container } = render(<Avatar name="أحمد" src="https://cdn.example.com/a.png" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
  });

  it("scales through the set the product uses", () => {
    const { container, rerender } = render(<Avatar name="أ" size="sm" />);
    expect(container.querySelector("span")?.className).toContain("size-8");
    rerender(<Avatar name="أ" size="xl" />);
    expect(container.querySelector("span")?.className).toContain("size-24");
  });
});

describe("ProgressBar", () => {
  it("tells a screen reader the number, because a filled bar alone says nothing", () => {
    render(<ProgressBar value={42} label="تقدم القراءة" />);

    const bar = screen.getByRole("progressbar", { name: "تقدم القراءة" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps values the API could report out of range", () => {
    const { rerender } = render(<ProgressBar value={140} label="تقدم القراءة" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    rerender(<ProgressBar value={-5} label="تقدم القراءة" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("animates with a transform, so it never triggers layout on every frame", () => {
    const { container } = render(<ProgressBar value={25} label="تقدم القراءة" />);
    const fill = container.querySelector("[style]");
    expect(fill?.getAttribute("style")).toContain("scaleX(0.25)");
  });
});

describe("Skeleton", () => {
  it("carries the design system's shimmer", () => {
    const { container } = render(<Skeleton className="h-4 w-1/2" />);
    const block = container.firstElementChild;
    expect(block?.className).toContain("hk-skeleton");
    expect(block?.className).toContain("animate-skeleton");
    expect(block?.className).toContain("h-4");
  });

  it("marks a whole placeholder list hidden, because a status region already announced it", () => {
    const { container } = render(<StoryFeedSkeleton count={2} />);
    const list = container.firstElementChild;
    expect(list?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThan(4);
  });

  it("shapes a list row like the row it stands in for", () => {
    const { container } = render(<ListRowSkeleton />);
    expect(container.firstElementChild?.className).toContain("border-line");
    expect(container.firstElementChild?.className).toContain("bg-surface");
  });
});

describe("EmptyState", () => {
  it("names what is missing instead of leaving a blank column", () => {
    render(<EmptyState title="لا توجد قصص بعد" description="كن أول من يكتب." />);
    expect(screen.getByRole("heading", { name: "لا توجد قصص بعد" })).toBeInTheDocument();
    expect(screen.getByText("كن أول من يكتب.")).toBeInTheDocument();
  });

  it("offers the one action that fills it", () => {
    render(<EmptyState title="لا توجد قصص" action={<button type="button">اكتب قصة</button>} />);
    expect(screen.getByRole("button", { name: "اكتب قصة" })).toBeInTheDocument();
  });

  it("reads as an absence, with a dashed edge rather than a solid surface", () => {
    render(<EmptyState title="فارغ" />);
    expect(screen.getByRole("heading", { name: "فارغ" }).parentElement?.className).toContain("border-dashed");
  });
});

describe("StatCard", () => {
  it("isolates its figure, so a count never reorders beside its label", () => {
    const { container } = render(<StatCard label="إجمالي القصص" value="1,500" icon="book" />);
    const figure = screen.getByText("1,500");
    expect(figure.className).toContain("hk-numeric");
    expect(container.textContent).toContain("إجمالي القصص");
  });

  it("keeps the figure and its hint readable", () => {
    render(<StatCard label="المتابعون" value={42} icon="users" hint="منذ أسبوع" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("منذ أسبوع")).toBeInTheDocument();
  });
});