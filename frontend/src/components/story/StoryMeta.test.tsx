/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { AUTHOR_PROFILE_LABEL, StoryByline, StoryCategory, UNCATEGORIZED_LABEL } from "@/components/story/StoryMeta";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const KNOWN_AUTHOR = { id: "user-1", name: "أحمد محمد" };
const UNKNOWN_AUTHOR = { id: "user-2", name: "" };
const BLANK_AUTHOR = { id: "user-3", name: "   " };
const NULL_AUTHOR = { id: "user-4", name: null };

describe("StoryByline", () => {
  it("names the author when the name is known", () => {
    render(<StoryByline author={KNOWN_AUTHOR} className="text-sm" />);
    expect(screen.getByText("بواسطة أحمد محمد")).toHaveClass("text-sm");
  });

  it("renders nothing at all when the author name is missing", () => {
    const { container } = render(<StoryByline author={UNKNOWN_AUTHOR} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing at all when the author name is only whitespace", () => {
    const { container } = render(<StoryByline author={BLANK_AUTHOR} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never leaves a dangling byline label behind", () => {
    render(<StoryByline author={UNKNOWN_AUTHOR} />);
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
  });

  it("links to the author profile when the profile link is requested", () => {
    render(<StoryByline author={KNOWN_AUTHOR} linkToProfile />);
    expect(screen.getByRole("link", { name: "بواسطة أحمد محمد" })).toHaveAttribute("href", "/users/user-1");
  });

  it("keeps the author profile reachable when the name is missing", () => {
    render(<StoryByline author={UNKNOWN_AUTHOR} linkToProfile />);
    expect(screen.getByRole("link", { name: AUTHOR_PROFILE_LABEL })).toHaveAttribute("href", "/users/user-2");
  });

  it("gives the fallback link an accessible name rather than empty content", () => {
    render(<StoryByline author={NULL_AUTHOR} linkToProfile />);
    const link = screen.getByRole("link", { name: AUTHOR_PROFILE_LABEL });
    expect(link).toHaveTextContent(AUTHOR_PROFILE_LABEL);
    expect(link).toHaveAttribute("href", "/users/user-4");
  });
});

describe("StoryCategory", () => {
  it("renders the category when one is set", () => {
    render(<StoryCategory category="fiction" />);
    expect(screen.getByText("fiction")).toBeInTheDocument();
  });

  it("treats a blank category as missing", () => {
    render(<StoryCategory category="   " />);
    expect(screen.getByText(UNCATEGORIZED_LABEL)).toBeInTheDocument();
  });

  it("falls back to the uncategorized affordance for a null category", () => {
    render(<StoryCategory category={null} />);
    expect(screen.getByText(UNCATEGORIZED_LABEL)).toBeInTheDocument();
  });

  it("marks the uncategorized affordance apart from a real category", () => {
    const { rerender } = render(<StoryCategory category={null} />);
    expect(screen.getByText(UNCATEGORIZED_LABEL).className).toContain("border-dashed");

    rerender(<StoryCategory category="fiction" />);
    expect(screen.getByText("fiction").className).not.toContain("border-dashed");
  });

  it("renders the uncategorized label inline when that variant is requested", () => {
    render(<StoryCategory category={null} variant="inline" />);
    expect(screen.getByText(UNCATEGORIZED_LABEL)).toBeInTheDocument();
    expect(screen.getByText(UNCATEGORIZED_LABEL)).not.toHaveTextContent("fiction");
  });

  it("renders a known category inline without a fallback label", () => {
    render(<StoryCategory category="poetry" variant="inline" />);
    expect(screen.getByText("poetry")).toBeInTheDocument();
    expect(screen.queryByText(UNCATEGORIZED_LABEL)).not.toBeInTheDocument();
  });
});
