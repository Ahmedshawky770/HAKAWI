/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";

import { ErrorMessage, SuccessMessage } from "@/components/ui/ErrorMessage";

describe("ErrorMessage", () => {
  it("renders a string error", () => {
    renderWithProviders(<ErrorMessage error="تعذر تحميل القصة" />);
    expect(screen.getByText("تعذر تحميل القصة")).toBeInTheDocument();
  });

  it("renders the message of an Error instance", () => {
    renderWithProviders(<ErrorMessage error={new Error("فشل الاتصال بالخادم")} />);
    expect(screen.getByText("فشل الاتصال بالخادم")).toBeInTheDocument();
  });

  it("labels the banner with a heading in the product's language", () => {
    renderWithProviders(<ErrorMessage error="خطأ" />);
    expect(screen.getByRole("heading", { name: "حدث خطأ" })).toBeInTheDocument();
  });

  it("accepts a heading from its context", () => {
    renderWithProviders(<ErrorMessage error="خطأ" title="تعذر حفظ القصة" />);
    expect(screen.getByRole("heading", { name: "تعذر حفظ القصة" })).toBeInTheDocument();
  });

  it("announces the banner as an alert so assistive technology reads it out", () => {
    renderWithProviders(<ErrorMessage error="تعذر تحميل القصة" />);
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر تحميل القصة");
  });

  it("announces the alert for an Error instance too", () => {
    renderWithProviders(<ErrorMessage error={new Error("فشل الاتصال بالخادم")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("فشل الاتصال بالخادم");
  });

  it("hides the decorative icon from assistive technology", () => {
    const { container } = renderWithProviders(<ErrorMessage error="خطأ" />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the semantic error tokens, so the banner follows the theme", () => {
    const { container } = renderWithProviders(<ErrorMessage error="خطأ" />);
    const banner = screen.getByRole("alert");
    expect(banner.className).toContain("bg-error-soft");
    expect(banner.className).toContain("border-error/40");
    expect(screen.getByRole("heading", { name: "حدث خطأ" }).className).toContain("text-error-ink");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-error-ink");
  });

  it("announces exactly one alert region", () => {
    renderWithProviders(<ErrorMessage error="خطأ" onRetry={vi.fn()} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("renders nothing at all when there is no error", () => {
    renderWithProviders(<ErrorMessage error={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing at all for an empty string error", () => {
    renderWithProviders(<ErrorMessage error="" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing at all for an Error with an empty message", () => {
    renderWithProviders(<ErrorMessage error={new Error("")} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("omits the retry button when no handler is supplied", () => {
    renderWithProviders(<ErrorMessage error="خطأ" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a retry button that calls the handler", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<ErrorMessage error="خطأ" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("takes the retry label from its context", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<ErrorMessage error="خطأ" onRetry={onRetry} retryLabel="أعد تحميل الجلسة" />);

    await user.click(screen.getByRole("button", { name: "أعد تحميل الجلسة" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the message visible while retrying", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<ErrorMessage error="تعذر تحميل القصص" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(screen.getByText("تعذر تحميل القصص")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeEnabled();
  });
});

describe("SuccessMessage", () => {
  it("confirms politely instead of interrupting", () => {
    renderWithProviders(<SuccessMessage title="تم النشر">حكايتك منشورة الآن</SuccessMessage>);
    expect(screen.getByRole("status")).toHaveTextContent("تم النشر");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the semantic success tokens", () => {
    renderWithProviders(<SuccessMessage>تم</SuccessMessage>);
    expect(screen.getByRole("status").className).toContain("bg-success-soft");
  });
});
