/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

/**
 * These assertions are about the DESIGN SYSTEM, not about Tailwind.
 *
 * The previous version asserted `bg-blue-600` and `bg-red-600`: classes that
 * came from the framework's stock palette rather than from the product's tokens.
 * Such a test passes on a button that has nothing to do with Hakawi's palette,
 * and fails the moment the palette changes — which is the exact opposite of what
 * a design-system test is for. Each variant is now asserted by its token.
 */
describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button").textContent).toBe("Click me");
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("applies the accent fill token by default", () => {
    render(<Button>Primary</Button>);
    expect(screen.getByRole("button").className).toContain("bg-accent-fill");
  });

  it("pairs the accent fill with the matching text token", () => {
    render(<Button>Primary</Button>);
    const classes = screen.getByRole("button").className;
    expect(classes).toContain("bg-accent-fill");
    expect(classes).toContain("text-on-accent");
  });

  it("applies the surface tokens to the secondary variant", () => {
    const classes = renderAndClassName(<Button variant="secondary">Secondary</Button>);
    expect(classes).toContain("bg-surface-raised");
    expect(classes).toContain("border-line-strong");
  });

  it("applies the error fill and its on-fill token to the danger variant", () => {
    const classes = renderAndClassName(<Button variant="danger">Danger</Button>);
    expect(classes).toContain("bg-error-fill");
    expect(classes).toContain("text-on-error");
  });

  it("keeps the danger variant out of the primary accent", () => {
    const classes = renderAndClassName(<Button variant="danger">Danger</Button>);
    expect(classes).not.toContain("bg-accent-fill");
  });

  it("renders the ghost variant with no resting fill", () => {
    const classes = renderAndClassName(<Button variant="ghost">Ghost</Button>);
    expect(classes).toContain("text-ink-muted");
    expect(classes).not.toContain("bg-accent-fill");
    expect(classes).not.toContain("bg-error-fill");
    // The only background it declares is the one it gains on hover.
    expect(classes.split(" ").filter((token) => token.startsWith("bg-"))).toEqual([]);
  });

  it("applies size classes correctly", () => {
    expect(renderAndClassName(<Button size="sm">Small</Button>)).toContain("text-sm");
  });

  it("keeps every size at or above the 44px touch target", () => {
    expect(renderAndClassName(<Button size="md">Medium</Button>)).toContain("min-h-11");
    expect(renderAndClassName(<Button size="lg">Large</Button>)).toContain("min-h-12");
    expect(renderAndClassName(<Button size="sm">Small</Button>)).toContain("min-h-9");
  });

  it("stretches to the container when block is set", () => {
    expect(renderAndClassName(<Button block>Wide</Button>)).toContain("w-full");
  });

  it("disables button when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when loading is true", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("announces the pending state as busy, not just visually", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("does not mark an idle button as busy", () => {
    render(<Button>Idle</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("calls onClick handler", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders loading spinner when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
  });

  it("keeps the label visible while loading, so the button does not resize", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Loading");
  });
});

describe("ButtonLink", () => {
  it("renders an anchor, not a button", () => {
    render(<ButtonLink href="/stories/create">اكتب قصة</ButtonLink>);
    const link = screen.getByRole("link", { name: "اكتب قصة" });
    expect(link).toHaveAttribute("href", "/stories/create");
    expect(link.className).toContain("bg-surface-raised");
  });

  it("can look like the primary action while still being a link", () => {
    render(
      <ButtonLink href="/stories/create" variant="primary">
        اكتب قصة
      </ButtonLink>,
    );
    expect(screen.getByRole("link").className).toContain("bg-accent-fill");
  });
});

describe("IconButton", () => {
  it("names itself, because an icon alone is not a control", () => {
    render(<IconButton label="تبديل المظهر" name="sun" />);
    expect(screen.getByRole("button", { name: "تبديل المظهر" })).toBeInTheDocument();
  });

  it("keeps a square touch target", () => {
    render(<IconButton label="إغلاق" name="close" />);
    expect(screen.getByRole("button", { name: "إغلاق" }).className).toContain("size-11");
  });
});

function renderAndClassName(ui: React.ReactElement): string {
  const { container } = render(ui);
  return container.firstElementChild?.className ?? "";
}
