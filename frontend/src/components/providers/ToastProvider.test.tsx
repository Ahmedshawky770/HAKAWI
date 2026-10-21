/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider, useToast } from "@/components/providers/ToastProvider";
import { renderWithProviders } from "@/test-utils/render";

function Trigger() {
  const { notify } = useToast();
  return (
    <div>
      <button type="button" onClick={() => notify("تم نشر حكايتك", "success")}>
        success
      </button>
      <button type="button" onClick={() => notify("تعذّر تسجيل التفاعل", "error")}>
        error
      </button>
      <button type="button" onClick={() => notify("معلومة")}>
        info
      </button>
    </div>
  );
}

function renderToast() {
  return renderWithProviders(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  it("announces politely, so it never interrupts what is being read", async () => {
    const user = userEvent.setup();
    const { container } = renderToast();

    const region = container.querySelector("[aria-live='polite']");
    expect(region).not.toBeNull();
    // Deliberately NOT `role="status"`: an always-present empty status region
    // makes every `getByRole("status")` in the product ambiguous.
    expect(region).not.toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: "info" }));

    expect(region).toHaveTextContent("معلومة");
  });

  it("escalates a failure to an alert", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "error" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذّر تسجيل التفاعل");
  });

  it("does not escalate a confirmation", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "success" }));

    expect(await screen.findByText("تم نشر حكايتك")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("colours each tone with its semantic tokens, so it follows the theme", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "error" }));

    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("text-error-ink");
    expect(alert.className).toContain("bg-error-soft");
  });

  it("is dismissable by the reader, through a control that says what it does", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "info" }));
    // The toast itself is NOT a control: it used to be a button whose name was
    // the message, which announced as "معلومة, button" and hid the fact that
    // the only thing the button did was close the toast. The name is matched
    // EXACTLY, because the close button beside the message does carry it.
    expect(screen.queryByRole("button", { name: "معلومة" })).not.toBeInTheDocument();

    // The name of the close button is the dismiss verb AND the message it
    // closes, so that two toasts on screen do not own two identical buttons.
    await user.click(await screen.findByRole("button", { name: "إغلاق: معلومة" }));

    expect(screen.queryByText("معلومة")).not.toBeInTheDocument();
  });

  it("names each close button after the toast it closes", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "info" }));
    await user.click(screen.getByRole("button", { name: "success" }));

    // Two toasts, two close buttons, and the two buttons are NOT the same
    // control to a screen reader: the name carries the message it closes.
    const closeButtons = screen.getAllByRole("button", { name: /^إغلاق/ });
    expect(closeButtons).toHaveLength(2);

    const names = closeButtons.map((button) => button.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toContain("معلومة");
    expect(names[1]).toContain("تم نشر حكايتك");
  });

  it("stacks several messages instead of replacing the earlier one", async () => {
    const user = userEvent.setup();
    const { container } = renderToast();

    await user.click(screen.getByRole("button", { name: "info" }));
    await user.click(screen.getByRole("button", { name: "success" }));

    const region = container.querySelector("[aria-live='polite']");
    expect(region).toHaveTextContent("معلومة");
    expect(region).toHaveTextContent("تم نشر حكايتك");
  });
});
