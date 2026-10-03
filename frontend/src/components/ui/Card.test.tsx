/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";

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

  it("applies the base card styling without a custom className", () => {
    const { container } = render(<Card>محتوى</Card>);
    const card = container.firstElementChild;
    expect(card).not.toBeNull();
    expect(card?.className).toContain("bg-white");
    expect(card?.className).toContain("rounded-lg");
    expect(card?.className).toContain("border-gray-200");
  });

  it("keeps the base styling and appends a custom className", () => {
    const { container } = render(<Card className="border-blue-200 bg-blue-50">محتوى</Card>);
    const card = container.firstElementChild;
    expect(card?.className).toContain("bg-white");
    expect(card?.className).toContain("bg-blue-50");
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
    expect(body?.className).toContain("py-4");
    expect(body?.className).not.toContain("border-b");
    expect(footer?.className).toContain("border-t");
    expect(card).toBeDefined();
  });

  it("merges a custom className into each card part", () => {
    const { container } = render(
      <Card className="gap-2">
        <CardHeader className="bg-gray-50">العنوان</CardHeader>
        <CardBody className="space-y-2">المحتوى</CardBody>
        <CardFooter className="justify-end">التذييل</CardFooter>
      </Card>,
    );

    const parts = Array.from(container.firstElementChild?.children ?? []);
    expect(parts[0]?.className).toContain("bg-gray-50");
    expect(parts[1]?.className).toContain("space-y-2");
    expect(parts[2]?.className).toContain("justify-end");
  });

  it("renders nothing but the empty card when it has no children", () => {
    const { container } = render(<Card>{null}</Card>);
    expect(container.firstElementChild).toBeInTheDocument();
    expect(container.firstElementChild?.childNodes.length).toBe(0);
  });
});
