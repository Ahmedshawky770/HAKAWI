/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Input } from "@/components/ui/Input";

describe("Input", () => {
  it("associates the label with the input so it is reachable by label", () => {
    render(<Input label="البريد الإلكتروني" />);
    expect(screen.getByLabelText("البريد الإلكتروني")).toBeInTheDocument();
  });

  it("renders no label element when the label prop is omitted", () => {
    render(<Input aria-label="بدون تسمية" />);
    expect(screen.getByLabelText("بدون تسمية")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "" })).not.toBeInTheDocument();
  });

  it("keeps a caller supplied id as the label target", () => {
    render(<Input id="custom-id" label="الاسم" />);
    const input = screen.getByLabelText("الاسم");
    expect(input).toHaveAttribute("id", "custom-id");
  });

  it("renders the current value", () => {
    render(<Input label="الاسم" value="أحمد" onChange={() => undefined} readOnly />);
    expect(screen.getByLabelText("الاسم")).toHaveValue("أحمد");
  });

  it("reports every keystroke through onChange", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input label="الاسم" onChange={handleChange} />);

    const input = screen.getByLabelText("الاسم");
    await user.type(input, "ab");

    expect(handleChange).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue("ab");
  });

  it("does not accept interaction while disabled", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input label="الاسم" disabled onChange={handleChange} />);

    const input = screen.getByLabelText("الاسم");
    expect(input).toBeDisabled();
    await user.type(input, "abc");
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("does not fire onChange for a readOnly input", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input label="الاسم" readOnly value="ثابت" onChange={handleChange} />);

    await user.type(screen.getByLabelText("الاسم"), "z");
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("marks itself required when the required prop is set", () => {
    render(<Input label="الاسم" required />);
    expect(screen.getByLabelText("الاسم")).toBeRequired();
  });

  it("exposes the declared input type", () => {
    render(<Input label="كلمة المرور" type="password" />);
    const input = screen.getByLabelText("كلمة المرور");
    expect(input).toHaveAttribute("type", "password");
  });

  it("renders no error message and no invalid state by default", () => {
    render(<Input label="الاسم" />);
    const input = screen.getByLabelText("الاسم");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces the error message and links it to the input", () => {
    render(<Input label="البريد الإلكتروني" error="بريد غير صالح" />);

    const input = screen.getByLabelText("البريد الإلكتروني");
    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("بريد غير صالح");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.getAttribute("id"));
  });

  it("applies the error styling instead of the neutral border", () => {
    const { container } = render(<Input label="الاسم" error="خطأ" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("border-red-500");
    expect(input?.className).not.toContain("border-gray-300");
  });

  it("keeps the caller className next to the base styling", () => {
    const { container } = render(<Input label="الاسم" className="w-1/2" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("w-full");
    expect(input?.className).toContain("w-1/2");
  });
});
