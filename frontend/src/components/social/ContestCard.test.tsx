/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import {
  ContestCard,
  ContestCardSkeleton,
  ContestListEmpty,
  ContestListSkeleton,
} from "@/components/social/ContestCard";
import type { Contest } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const CONTEST: Contest = {
  id: "contest-1",
  title: "مسابقة الغموض",
  description: "اكتب قصة غامضة تنتهي بسؤال.",
  categoryId: "غموض",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-02-01T00:00:00.000Z",
  submissionDeadline: "2026-01-25T00:00:00.000Z",
  status: "active",
  createdBy: "user-1",
  winnerId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ContestCard", () => {
  it("renders the title, the description and one link to the contest", () => {
    renderWithProviders(<ContestCard contest={CONTEST} />);

    expect(screen.getByRole("heading", { name: CONTEST.title })).toBeInTheDocument();
    expect(screen.getByText(CONTEST.description as string)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: new RegExp(CONTEST.title) });
    expect(link).toHaveAttribute("href", "/contests/contest-1");
  });

  it("shows the status as a badge and the period as two isolated dates", () => {
    const { container } = renderWithProviders(<ContestCard contest={CONTEST} />);

    expect(screen.getByText("جارية")).toBeInTheDocument();
    expect(screen.getByText("إلى")).toHaveClass("sr-only");

    const dates = container.querySelectorAll(".hk-numeric");
    expect(dates).toHaveLength(2);
    expect(dates[0]?.textContent).toBe(
      new Date(CONTEST.startDate).toLocaleDateString("ar-EG"),
    );
    expect(dates[1]?.textContent).toBe(new Date(CONTEST.endDate).toLocaleDateString("ar-EG"));
  });

  it("omits the description block when the contest has none", () => {
    const { container } = renderWithProviders(
      <ContestCard contest={{ ...CONTEST, description: null }} />,
    );

    expect(screen.getByRole("heading", { name: CONTEST.title })).toBeInTheDocument();
    expect(container.querySelector(".line-clamp-2")).toBeNull();
  });

  it("uses design tokens only, with no stock palette colour", () => {
    const { container } = renderWithProviders(<ContestCard contest={CONTEST} />);
    const classes = container.innerHTML;

    expect(classes).not.toMatch(/text-gray-|bg-white|border-gray-|text-blue-|bg-blue-/);
  });
});

describe("ContestListSkeleton", () => {
  it("hides the placeholders from assistive technology and counts them", () => {
    const { container } = renderWithProviders(<ContestListSkeleton count={3} />);
    const list = container.firstElementChild;

    expect(list).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThanOrEqual(9);
  });

  it("renders a single card placeholder on its own", () => {
    const { container } = renderWithProviders(<ContestCardSkeleton />);
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThan(0);
  });
});

describe("ContestListEmpty", () => {
  it("names what is missing in Arabic", () => {
    renderWithProviders(<ContestListEmpty />);
    expect(screen.getByRole("heading", { name: "لا توجد مسابقات بعد" })).toBeInTheDocument();
  });
});