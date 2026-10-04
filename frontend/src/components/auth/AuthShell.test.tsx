/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { AuthShell } from "@/components/auth/AuthShell";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

describe("AuthShell", () => {
  it("renders the title as the single level one heading", () => {
    render(
      <AuthShell title="تسجيل الدخول">
        <button type="button">إرسال</button>
      </AuthShell>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the supporting line when one is given", () => {
    render(
      <AuthShell title="استعادة كلمة المرور" description="أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين">
        <p>المحتوى</p>
      </AuthShell>,
    );
    expect(screen.getByText("أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين")).toBeInTheDocument();
  });

  it("omits the supporting line when none is given", () => {
    const { container } = render(<AuthShell title="إعادة تعيين كلمة المرور">{null}</AuthShell>);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("renders the footer line under the card", () => {
    render(
      <AuthShell title="تسجيل الدخول" footer={<a href="/register">إنشاء حساب جديد</a>}>
        <p>المحتوى</p>
      </AuthShell>,
    );

    expect(screen.getByRole("link", { name: "إنشاء حساب جديد" })).toHaveAttribute("href", "/register");
  });

  it("renders no footer line when none is given", () => {
    render(<AuthShell title="تسجيل الدخول">{null}</AuthShell>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the wordmark as the Arabic mark", () => {
    const { container } = render(<AuthShell title="تسجيل الدخول">{null}</AuthShell>);
    expect(container).toHaveTextContent("حكاوي");
    expect(container).toHaveTextContent("ح");
  });

  it("does not turn the wordmark into a link out of the authentication flow", () => {
    render(<AuthShell title="تسجيل الدخول">{null}</AuthShell>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders its children inside the card", () => {
    render(
      <AuthShell title="تسجيل الدخول">
        <button type="button">تسجيل الدخول</button>
      </AuthShell>,
    );

    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeInTheDocument();
  });

  it("centres the column on the canvas and raises the card", () => {
    const { container } = render(<AuthShell title="تسجيل الدخول">المحتوى</AuthShell>);
    const frame = container.firstElementChild;
    expect(frame?.className).toContain("bg-canvas");
    expect(frame?.className).toContain("items-center");

    const card = container.querySelector(".rounded-xl");
    expect(card?.className).toContain("bg-surface");
    expect(card?.className).toContain("shadow-card");
  });
});