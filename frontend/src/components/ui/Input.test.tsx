/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Input, Select, Textarea } from "@/components/ui/Input";

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
    expect(screen.getByLabelText("الاسم")).toHaveAttribute("id", "custom-id");
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
    expect(screen.getByLabelText("كلمة المرور")).toHaveAttribute("type", "password");
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

  it("applies the error token instead of the neutral border", () => {
    const { container } = render(<Input label="الاسم" error="خطأ" />);
    const classes = (container.querySelector("input")?.className ?? "").split(" ");
    expect(classes).toContain("border-error");
    expect(classes).not.toContain("border-line");
  });

  it("describes the field with its hint when there is no error", () => {
    render(<Input label="الاسم" hint="اكتب اسمك الكامل" />);
    const input = screen.getByLabelText("الاسم");
    const hint = screen.getByText("اكتب اسمك الكامل");
    expect(input).toHaveAttribute("aria-describedby", hint.getAttribute("id"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the caller className next to the base styling", () => {
    const { container } = render(<Input label="الاسم" className="w-1/2" />);
    const input = container.querySelector("input");
    expect(input?.className).toContain("w-full");
    expect(input?.className).toContain("w-1/2");
  });
});

describe("Textarea", () => {
  it("labels the textarea and reports what the reader types", async () => {
    const user = userEvent.setup();
    render(<Textarea label="المحتوى" onChange={() => undefined} />);

    const textarea = screen.getByLabelText("المحتوى");
    await user.type(textarea, "حكاية");

    expect(textarea).toHaveValue("حكاية");
  });

  it("gives the long form a minimum height, so the page does not jump per keystroke", () => {
    const { container } = render(<Textarea label="المحتوى" />);
    expect(container.querySelector("textarea")?.className).toContain("min-h-32");
  });

  it("announces its error exactly as the input does", () => {
    render(<Textarea label="المحتوى" error="القصة قصيرة" />);
    expect(screen.getByLabelText("المحتوى")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("القصة قصيرة");
  });
});

describe("Select", () => {
  const OPTIONS = [
    { value: "fiction", label: "خيال" },
    { value: "poetry", label: "شعر" },
  ];

  it("labels the select and renders every option", () => {
    render(<Select label="التصنيف" options={OPTIONS} defaultValue="fiction" />);

    const select = screen.getByLabelText("التصنيف") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe("fiction");
  });

  it("reports the chosen option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="التصنيف" options={OPTIONS} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("التصنيف"), "poetry");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("التصنيف") as HTMLSelectElement).value).toBe("poetry");
  });

  it("announces its error like every other control", () => {
    render(<Select label="التصنيف" options={OPTIONS} error="اختر تصنيفاً" />);
    expect(screen.getByLabelText("التصنيف")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("اختر تصنيفاً");
  });
});
