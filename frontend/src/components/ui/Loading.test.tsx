/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Loading } from "@/components/ui/Loading";

describe("Loading", () => {
  it("exposes a polite live status region", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders the default loading text", () => {
    render(<Loading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders a custom loading text", () => {
    render(<Loading text="جاري التحميل" />);
    expect(screen.getByText("جاري التحميل")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("renders the status region without a text node when the text is empty", () => {
    const { container } = render(<Loading text="" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(container.querySelector("p")).toBeNull();
  });

  it("hides the decorative spinner from assistive technology", () => {
    const { container } = render(<Loading />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.getAttribute("class")).toContain("animate-spin");
  });

  it("applies the small size", () => {
    const { container } = render(<Loading size="sm" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("h-4");
  });

  it("applies the medium size by default", () => {
    const { container } = render(<Loading />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("h-8");
  });

  it("applies the large size", () => {
    const { container } = render(<Loading size="lg" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("h-12");
  });

  it("never renders an error message", () => {
    render(<Loading />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Error" })).not.toBeInTheDocument();
  });
});
