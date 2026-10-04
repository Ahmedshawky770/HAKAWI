/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { Card, CardBody, CardFooter, CardHeader, PageHeader } from "@/components/ui/Card";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>محتوى البطاقة</Card>);
    expect(screen.getByText("محتوى البطاقة")).toBeInTheDocument();
  });

  it("renders CardHeader, CardBody and CardFooter inside the card", () => {
    render(
      <Card>
        <CardHeader>العنوان</CardHeader>
        <CardBody>المحتوى</CardBody>
        <CardFooter>التذييل</CardFooter>
      </Card>,
    );

    expect(screen.getByText("العنوان")).toBeInTheDocument();
    expect(screen.getByText("المحتوى")).toBeInTheDocument();
    expect(screen.getByText("التذييل")).toBeInTheDocument();
  });

  it("renders arbitrary react nodes as children", () => {
    render(
      <Card>
        <button type="button">إجراء</button>
      </Card>,
    );
    expect(screen.getByRole("button", { name: "إجراء" })).toBeInTheDocument();
  });

  it("applies the design system surface tokens, not a stock palette colour", () => {
    const { container } = render(<Card>محتوى</Card>);
    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-surface");
    expect(card?.className).toContain("border-line");
    expect(card?.className).toContain("rounded-xl");
    expect(card?.className).not.toContain("bg-white");
  });

  it("keeps the base styling and appends a custom className", () => {
    const { container } = render(<Card className="border-chrome/40">محتوى</Card>);
    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-surface");
    expect(card?.className).toContain("border-chrome/40");
  });

  it("only raises and glows when it is interactive", () => {
    const { container: plain } = render(<Card>ساكن</Card>);
    const { container: interactive } = render(<Card interactive>تفاعلي</Card>);

    expect(plain.firstElementChild?.className).not.toContain("hover:shadow");
    expect(interactive.firstElementChild?.className).toContain("hover:shadow");
  });

  it("applies the section styling of each card part", () => {
    const { container } = render(
      <Card>
        <CardHeader>العنوان</CardHeader>
        <CardBody>المحتوى</CardBody>
        <CardFooter>التذييل</CardFooter>
      </Card>,
    );

    const [card, header, body, footer] = Array.from(container.children).concat(
      Array.from(container.firstElementChild?.children ?? []),
    );

    expect(header?.className).toContain("border-b");
    expect(body?.className).toContain("p-6");
    expect(body?.className).not.toContain("border-b");
    expect(footer?.className).toContain("border-t");
    expect(card).toBeDefined();
  });

  it("merges a custom className into each card part", () => {
    const { container } = render(
      <Card className="gap-2">
        <CardHeader className="bg-surface-raised">العنوان</CardHeader>
        <CardBody className="space-y-2">المحتوى</CardBody>
        <CardFooter className="justify-end">التذييل</CardFooter>
      </Card>,
    );

    const parts = Array.from(container.firstElementChild?.children ?? []);
    expect(parts[0]?.className).toContain("bg-surface-raised");
    expect(parts[1]?.className).toContain("space-y-2");
    expect(parts[2]?.className).toContain("justify-end");
  });

  it("renders nothing but the empty card when it has no children", () => {
    const { container } = render(<Card>{null}</Card>);
    expect(container.firstElementChild).toBeInTheDocument();
    expect(container.firstElementChild?.childNodes.length).toBe(0);
  });
});

describe("PageHeader", () => {
  it("renders the page title as the level one heading", () => {
    render(<PageHeader title="القصص" />);
    expect(screen.getByRole("heading", { level: 1, name: "القصص" })).toBeInTheDocument();
  });

  it("renders the supporting line and the action side by side", () => {
    render(
      <PageHeader
        title="القصص"
        description="أحدث الحكايات"
        action={<button type="button">اكتب قصة</button>}
      />,
    );
    expect(screen.getByText("أحدث الحكايات")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اكتب قصة" })).toBeInTheDocument();
  });
});
