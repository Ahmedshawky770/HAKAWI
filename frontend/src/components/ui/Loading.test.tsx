/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render";

import { Loading } from "@/components/ui/Loading";

describe("Loading", () => {
  it("exposes a polite live status region", () => {
    renderWithProviders(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders the default loading text in the product's language", () => {
    renderWithProviders(<Loading />);
    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("renders a custom loading text", () => {
    renderWithProviders(<Loading text="جاري التحميل" />);
    expect(screen.getByText("جاري التحميل")).toBeInTheDocument();
    expect(screen.queryByText("جارٍ التحميل…")).not.toBeInTheDocument();
  });

  it("renders the status region without a text node when the text is empty", () => {
    const { container } = renderWithProviders(<Loading text="" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(container.querySelector("p")).toBeNull();
  });

  it("hides the decorative spinner from assistive technology", () => {
    const { container } = renderWithProviders(<Loading />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.getAttribute("class")).toContain("animate-spin");
  });

  it("paints the spinner with the accent token", () => {
    const { container } = renderWithProviders(<Loading />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-accent");
  });

  it("applies the small size", () => {
    const { container } = renderWithProviders(<Loading size="sm" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("size-4");
  });

  it("applies the medium size by default", () => {
    const { container } = renderWithProviders(<Loading />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("size-8");
  });

  it("applies the large size", () => {
    const { container } = renderWithProviders(<Loading size="lg" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("size-12");
  });

  it("can own the whole screen for a route-level guard", () => {
    const { container } = renderWithProviders(<Loading fullScreen />);
    expect(container.firstElementChild?.className).toContain("min-h-[70dvh]");
  });

  it("never renders an error message", () => {
    renderWithProviders(<Loading />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "حدث خطأ" })).not.toBeInTheDocument();
  });
});
